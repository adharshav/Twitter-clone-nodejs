const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())
const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running at 3000')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

const authenticateToken = async (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (authHeader === undefined) {
    response.status = 401
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_CODE', (error, payload) => {
      if (error) {
        response.status = 401
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

//Register API
app.post('/register/', async (request, response) => {
  const {name, username, password, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `
    SELECT 
    * 
    FROM 
    user 
    WHERE 
    username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    const createUserQuery = `
        INSERT INTO 
        user (name, username, password, gender) 
        VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}')`
    if (password.length < 6) {
      response.status = 400
      response.send('Password is too short')
    } else {
      await db.run(createUserQuery)
      response.status = 200
      response.send('User created successfully')
    }
  } else {
    response.status = 400
    response.send('User already exists')
  }
})

//Login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
    SELECT 
    * 
    FROM 
    user 
    WHERE 
    username = '${username}'`
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    response.status = 400
    response.send('Invalid user')
  } else {
    isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_CODE')
      response.send({jwtToken})
    } else {
      response.status = 400
      response.send('Invalid password')
    }
  }
})

//Return latest tweets of people the  user follows. 4 tweets at a time
/*app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {userId} = request.body

  const getTweetQuery = `
  SELECT u.username, t.tweet, t.date_time AS dateTime 
  FROM user AS u 
  INNER JOIN 
  follower ON u.user_id = follower.following_user_id 
  INNER JOIN 
  tweet AS t ON u.user_id = t.user_id
  WHERE 
  follower.follower_user_id = ${userId} 
  ORDER BY 
  t.date_time DESC 
  LIMIT 
  4;`
  const getTweet = await db.all(getTweetQuery)
  response.send(getTweet)
})*/

//return list of all names of people the user  follows
app.get('/user/following', authenticateToken, async (request, response) => {
  const {user_id, name} = request
  console.log(name)
  const userFollowsQuery = `
        SELECT 
            name
        FROM 
            user AS INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id = ${user_id}    
        ;`

  const userFollowsArray = await db.all(userFollowsQuery)
  response.send(userFollowsArray)
})
