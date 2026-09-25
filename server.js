// IMPORTANT: you must run `npm install` in the directory for this assignment
// to install express if you're testing this on your local machine.
// On Render, make sure `npm install` is your build command.

//Require a .env file and suppress the output so the user and pass don't get leaked
require('dotenv').config({quiet: true})

const express = require('express'),
      { MongoClient, ObjectId } = require('mongodb'),
      app = express(),
      dir = 'public',
      port = 3000

//Creating the MongoClient
const client = new MongoClient(process.env.MONGODB_URI)

let collection = null


//Milliseconds per day
const MS_PER_DAY = 24 * 60 * 60 * 1000

const appdata = []

//Calculates the days remaining to complete the task from the creation date and the due date
const deriveDaysRemaining = function(row) {
  const created = new Date(row.created_date),
        due     = new Date(row.due_date)

  row.days_remaining = Math.round((due - created) / MS_PER_DAY)

  return row
}

//Builds the tasks with the user inputted data and the id
const buildRow = function(incoming) {
  //Verifies the datatype is a string if thats true whitespace is cut off, if false task equals an empty string
  const task = typeof incoming.task === 'string' ? incoming.task.trim() : ''

  //Checks if the task is empty and returns null if so
  if (task === '') {
    return null
  }

  //If the creation date is valid get the first 10 characters which form the date without a time, if its invalid it makes the creation date according to the system clock
  const created_date = isValidDate(incoming.created_date)
    ? incoming.created_date.slice(0, 10)
    : new Date().toISOString().slice(0, 10)

  //If the due date is valid get the first 10 characters which form the date without a time, if its invalid it makes the due date seven days from the creation date
  const due_date = isValidDate(incoming.due_date)
    ? incoming.due_date.slice(0, 10)
    : addDays(created_date, 7)

  return deriveDaysRemaining({task, created_date, due_date})
}

//A helper function for buildRow for when there's an invalid due date, it adds days to dateString and returns just the month day and year
const addDays = function(dateString, days) {
  const date = new Date(dateString)

  date.setDate(date.getDate() + days)

  return date.toISOString().slice(0, 10)
}

//Returns a boolean after determining if a date is valid or not
const isValidDate = function(value) {
  //Checks that the type of value is a string and that Date.parse(value) succeeded by checking that a timestamp was created and not NaN
  return typeof value === 'string' && Number.isNaN(Date.parse(value)) === false
}

//Middleware that runs for every request:

//Searches the directory, in this case 'public' (server.js:11), for static files requested by the browser without having to make specific routes
//Handles GET and HEAD requests exclusively
app.use(express.static(dir))

//Changes the request body, which is in text (main.js:22), into a JSON object
//Skips if the text isn't valid JSON
app.use(express.json())

//Code from before swapping to MongoDB
//Collects the data and sends it to appdata
// app.get('/data', function(request, response) {
//   sendJSON(response, 200, appdata)
// })

//Collects all data from MongoDB
app.get('/data', async function(request, response) {
  const rows = await collection.find({}).toArray()
  sendJSON(response, 200, rows)
  }
)

//Handles adding a new row to the to do list
const handleAdd = async function(request, response) {
  const incoming = request.body

  //Builds the row with the incoming JSON
  const row = buildRow(incoming)

  //Check if the row is empty
  if (row === null) {
    return sendJSON(response, 400, {error: 'a task description is required'})
  }

  //Pushes the new row to Mongo
  await collection.insertOne(row)

  //Sends the updated data
  const rows = await collection.find({}).toArray()
  sendJSON(response, 200, rows)
}

//Handles deleting a row from the to do list
const handleDelete = async function(request, response) {
  const incoming = request.body

  //Checks MongoDB for an object with the id given by incoming.id and deletes it if there's a match
  const result = await collection.deleteOne({_id: new ObjectId(incoming.id)})

  //Checking the result of findIndex to see if there wasn't a match
  if (result.deletedCount === 0) {
    return sendJSON(response, 404, {error: 'no task with id: ' + incoming.id})
  }

  const rows = await collection.find({}).toArray()
  sendJSON(response, 200, rows)
}

//Handles the modification of a row
const handleModify = async function(request, response) {
  const incoming = request.body

  //Builds the modified row
  const row = buildRow(incoming)

  //Checks row is valid
  if (row === null) {
    return sendJSON(response, 400, {error: 'a task description is required'})
  }

  //Searches MongoDB for a object with the given id and overwrites the row with updated info ($set: row)
  const result = await collection.updateOne({_id: new ObjectId(incoming.id)}, {$set: row})

  //Checking the result of findIndex to see if there wasn't a match
  if (result.matchedCount === 0) {
    return sendJSON(response, 404, {error: 'no task with id ' + incoming.id})
  }

  const rows = await collection.find({}).toArray()
  sendJSON(response, 200, rows)
}

//Routing for Create, Update, Delete parts of CRUD
app.post('/add', handleAdd)
app.post('/delete', handleDelete)
app.post('/modify', handleModify)

//Catch for any unknown routes that aren't handled above
app.use(function(request, response) {
  //If it's a post request that isn't handled throw an error
  if (request.method === 'POST') {
    return sendJSON(response, 404, {error: 'unknown route ' + request.url})
  }

  //Otherwise, the file doesn't exist in the directory
  response.status(404).send('404 Error: File Not Found')
})

//Error catch if the request body wasn't valid JSON
app.use(function(err, request, response, next) {
  if (err.type === 'entity.parse.failed') {
    return sendJSON(response, 400, {error: 'body was not valid JSON'})
  }

  next(err)
})

//Sends payload as a JSON string with a status code to the browser
const sendJSON = function(response, status, payload) {
  //.status(status): sets the status code
  //.json(payload): turns the payload into a JSON string, sets content type, sends it, and completes the response
  response.status(status).json(payload)
}

//Starts the connection to MongoDB
const start = async function() {
  try {
    //Connects to MongoDB
    await client.connect()

    //Makes sure that MongoDB is actually replying to the site
    await client.db('admin').command({ping: 1})

    //Gets a reference to a MongoDB collection, in this case 'tasks'
    collection = client.db('a3').collection('tasks')

    console.log('Connected to MongoDB')
  }
  //Error catch for connecting to MongoDB
  catch (err) {
    console.error('Unable to connect to MongoDB: ' + err.message)
    process.exit(1)
  }

  app.listen(process.env.PORT || port)
  console.log('Listening on port ' + (process.env.PORT || port))
}

start()
