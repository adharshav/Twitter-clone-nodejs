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
        request.username = payload.username
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
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `
  SELECT 
  user_id 
  FROM user 
  WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)

  const getFollowerIdsQuery = `
  SELECT 
  following_user_id 
  FROM follower 
  WHERE follower_user_id = ${getUserId.user_id};`
  const getFollowerIds = await db.all(getFollowerIdsQuery)
  const getFollowerIdsArray = getFollowerIds.map(eachUser => {
    return eachUser.following_user_id
  })

  const getTweetQuery = `
    SELECT u.username, t.tweet, t.date_time as dateTime 
    FROM user AS u 
    INNER JOIN tweet AS t ON u.user_id = t.user_id 
    WHERE u.user_id in (${getFollowerIdsArray})
    ORDER BY t.date_time DESC 
    LIMIT 4`
  const getTweet = await db.all(getTweetQuery)
  response.send(getTweet)
})

//return list of all names of people the user  follows
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `
  SELECT 
  user_id 
  FROM user 
  WHERE username ='${username}'`
  const getUserId = await db.get(getUserIdQuery)

  const getFollowingIdsQuery = `
  SELECT 
  following_user_id 
  FROM follower 
  WHERE follower_user_id = ${getUserId.user_id}`
  const getFollowingIdsArray = await db.all(getFollowingIdsQuery)
  const getFollowingIds = getFollowingIdsArray.map(eachUser => {
    return eachUser.following_user_id
  })

  const getFollowingNameQuery = `
  SELECT 
  name 
  FROM user 
  WHERE user_id IN (${getFollowingIds});`
  const getFollowingName = await db.all(getFollowingNameQuery)
  response.send(getFollowingName)
})

//return all names of people who follows the user
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `
  SELECT 
  user_id 
  FROM user 
  WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)

  const getFollowerIdsQuery = `
  SELECT 
  follower_user_id 
  FROM follower 
  WHERE following_user_id=${getUserId.user_id};`
  const getFollowerIdsArray = await db.all(getFollowerIdsQuery)
  const getFollowerIds = getFollowerIdsArray.map(eachUser => {
    return eachUser.follower_user_id
  })

  const getFollowersNameQuery = `
  SELECT 
  name 
  FROM 
  user 
  WHERE user_id IN (${getFollowerIds});`
  const getFollowersName = await db.all(getFollowersNameQuery)
  response.send(getFollowersName)
})

//Get tweet of user he is following
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const getUserIdQuery = `
  SELECT 
  user_id
  FROM user 
  WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)

  const getFollowingIdsQuery = `
  SELECT 
  following_user_id 
  FROM follower 
  WHERE follower_user_id = ${getUserId.user_id}`
  const getFollowingIdsArray = await db.all(getFollowingIdsQuery)
  const getFollowingIds = getFollowingIdsArray.map(eachUser => {
    return eachUser.following_user_id
  })

  const getTweetIdsQuery = `
  SELECT 
  tweet_id 
  FROM tweet 
  WHERE user_id IN (${getFollowingIds});`
  const getTweetsArray = await db.all(getTweetIdsQuery)
  const followingTweetIds = getTweetsArray.map(eachTweet => {
    return eachTweet.tweet_id
  })

  if (followingTweetIds.includes(parseInt(tweetId))) {
    const tweetDetailsQuery = `
    SELECT
    t.tweet,
    t.date_time AS tweetDate,
    COUNT(l.user_id) AS likes,
    COUNT(r.user_id) AS replies
    FROM
    tweet AS t
    LEFT JOIN like AS l ON t.tweet_id = l.tweet_id
    LEFT JOIN reply AS r ON t.tweet_id = r.tweet_id
    WHERE
    t.tweet_id = ${tweetId}
    GROUP BY
    t.tweet_id, t.tweet, t.date_time`

    const tweetDetails = await db.get(tweetDetailsQuery)
    response.send(tweetDetails)
  } else {
    response.status = 401
    response.send('Invalid Request')
  }
})

//Get the username who liked the tweet of a user he is following
const listOfUserNames = dbObject => {
  return {
    likes: dbObject,
  }
}
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserIdQuery = `
  SELECT 
  user_id
  FROM user 
  WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)

    const getFollowingIdsQuery = `
  SELECT 
  following_user_id 
  FROM follower 
  WHERE follower_user_id = ${getUserId.user_id}`
    const getFollowingIdsArray = await db.all(getFollowingIdsQuery)
    const getFollowingIds = getFollowingIdsArray.map(eachUser => {
      return eachUser.following_user_id
    })

    const getTweetIdsQuery = `
  SELECT 
  tweet_id 
  FROM tweet 
  WHERE user_id IN (${getFollowingIds});`
    const getTweetsArray = await db.all(getTweetIdsQuery)
    const followingTweetIds = getTweetsArray.map(eachTweet => {
      return eachTweet.tweet_id
    })

    if (followingTweetIds.includes(parseInt(tweetId))) {
      const getlikedUsersNameQuery = `
    SELECT 
    user.username AS likes
    FROM user 
    INNER JOIN like ON user.user_id = like.user_id 
    WHERE 
    like.tweet_id = ${tweetId}`
      const likedUserNamesArray = await db.all(getlikedUsersNameQuery)
      const likedUserNames = likedUserNamesArray.map(eachUser => {
        return eachUser.likes
      })
      response.send(listOfUserNames(likedUserNames))
    } else {
      response.status = 401
      response.send('Invalid Request')
    }
  },
)

//Get the list of replies for a tweet of a user he is following
const listOfUserReplies = dbObject => {
  return {
    replies: dbObject,
  }
}
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getUserIdQuery = `
  SELECT 
  user_id
  FROM user 
  WHERE username='${username}';`
    const getUserId = await db.get(getUserIdQuery)

    const getFollowingIdsQuery = `
  SELECT 
  following_user_id 
  FROM follower 
  WHERE follower_user_id = ${getUserId.user_id}`
    const getFollowingIdsArray = await db.all(getFollowingIdsQuery)
    const getFollowingIds = getFollowingIdsArray.map(eachUser => {
      return eachUser.following_user_id
    })

    const getTweetIdsQuery = `
  SELECT 
  tweet_id 
  FROM tweet 
  WHERE user_id IN (${getFollowingIds});`
    const getTweetsArray = await db.all(getTweetIdsQuery)
    const followingTweetIds = getTweetsArray.map(eachTweet => {
      return eachTweet.tweet_id
    })

    if (followingTweetIds.includes(parseInt(tweetId))) {
      const getRepliedUsersNameQuery = `
    SELECT 
    u.name, r.reply
    FROM user AS u
    INNER JOIN reply AS r ON u.user_id = r.user_id 
    WHERE 
    r.tweet_id = ${tweetId}`
      const repliedUserNamesArray = await db.all(getRepliedUsersNameQuery)
      const repliedUserNames = repliedUserNamesArray.map(eachUser => ({
        name: eachUser.name,
        reply: eachUser.reply,
      }))
      response.send(listOfUserReplies(repliedUserNames))
    } else {
      response.status = 401
      response.send('Invalid Request')
    }
  },
)

//Returns a list of all tweets of the user
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const getUserIdQuery = `
  SELECT 
  user_id
  FROM user 
  WHERE username='${username}';`
  const getUserId = await db.get(getUserIdQuery)

  const getUserTweetsQuery = `
  SELECT 
  tweet.tweet, 
  COUNT(DISTINCT like.user_id) AS likes, 
  COUNT(DISTINCT reply.user_id) AS replies, 
  tweet.date_time AS dateTime
  FROM 
  tweet 
  LEFT JOIN like ON tweet.tweet_id = like.tweet_id
  LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
  WHERE tweet.user_id = ${getUserId.user_id} `

  const userTweetsArray = await db.all(getUserTweetsQuery)
  const userTweets = userTweetsArray.map(eachTweet => ({
    tweet: eachTweet.tweet,
    likes: eachTweet.likes,
    replies: eachTweet.replies,
    dateTime: eachTweet.dateTime,
  }))
  response.send(userTweets)
})

