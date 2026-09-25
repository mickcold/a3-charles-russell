let editingId = null

//Gets today's date excluding the time
const todayString = function() {
  return new Date().toISOString().slice(0, 10)
}

//Sets the default due date to seven days after the creation date
const defaultDueString = function() {
  const date = new Date()

  date.setDate(date.getDate() + 7)

  return date.toISOString().slice(0, 10)
}

//Sends requests, awaits a response, and then sends it to be rendered
const send = async function(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const data = await response.json()

  if (response.ok) {
    renderList(data)
    return true
  }

  setStatus(data.error, true)
  return false
}

//Renders the to do list items
const renderList = function(data) {
  const list  = document.querySelector('#todo-list'),
        empty = document.querySelector('#empty-message')

  list.innerHTML = ''

  //Builds each task in the data list
  data.forEach(function(row) {
    list.appendChild(buildRowElement(row))
  })

  //empty is hidden if the length of data is larger than 0
  empty.hidden = data.length > 0
}

//Builds the list of tasks
const buildRowElement = function(row) {
  //Building the HTML for the task
  const item = document.createElement('li'),
        text = document.createElement('span'),
        due  = document.createElement('span'),
        left = document.createElement('span')

  text.textContent = row.task
  text.className   = 'task-text'

  due.textContent = '— ' + row.due_date
  due.className   = 'task-due'

  left.textContent = '· ' + describeDaysRemaining(row.days_remaining)
  left.className   = 'task-remaining'

  text.appendChild(due)
  text.appendChild(left)

  item.className = 'task-row'
  item.appendChild(text)
  item.appendChild(actionGroup(row))

  return item
}

//Defines how the due date should be shown
const describeDaysRemaining = function(days) {
  if (days === 0) {
    return 'due today'
  }
  if (days === 1) { 
    return '1 day'
  }
  if (days > 1) { 
    return days + ' days'
  }
  if (days === -1) {
    return '1 day overdue'
  } 

  return Math.abs(days) + ' days overdue'
}

//Handles actions like editing and deleting a task
const actionGroup = function(row) {
  const group  = document.createElement('div'),
        edit   = document.createElement('button'),
        remove = document.createElement('button')

  group.className = 'row-actions'

  //Edit button
  edit.type        = 'button'
  edit.textContent = 'Edit'
  edit.className   = 'row-button edit'
  edit.onclick     = function() { startEdit(row) }

  //Delete button
  remove.type        = 'button'
  remove.textContent = 'Delete'
  remove.className   = 'row-button delete'
  remove.onclick     = async function() {
    const ok = await send('/delete', { id: row._id })

    if (ok) {
      setStatus('Deleted "' + row.task + '".', false)

      if (editingId === row._id) {
        closeForm()
      }
    }
  }

  group.appendChild(edit)
  group.appendChild(remove)

  return group
}

//Unhides the add task form
const openForm = function() {
  document.querySelector('#todo-form').hidden = false
  document.querySelector('#add-button').setAttribute('aria-expanded', 'true')
  document.querySelector('#add-glyph').textContent = '×'
  document.querySelector('#task').focus()
}

//Closes the add task form
const closeForm = function() {
  editingId = null

  const form = document.querySelector('#todo-form')

  //Hides the form
  form.reset()
  form.hidden = true

  //Resets the values in the form
  document.querySelector('#created-date').value = todayString()
  document.querySelector('#due-date').value     = defaultDueString()
  document.querySelector('#submit-button').textContent = 'Add task'

  //Hides the new task form and returns the page to normal
  document.querySelector('#add-button').setAttribute('aria-expanded', 'false')
  document.querySelector('#add-glyph').textContent = '+'
}

//Resets the form if it isn't open
const toggleForm = function() {
  const isOpen = document.querySelector('#todo-form').hidden === false

  if (isOpen) {
    closeForm()
    setStatus('', false)
    return
  }

  editingId = null

  document.querySelector('#submit-button').textContent = 'Add task'
  document.querySelector('#created-date').value = todayString()
  document.querySelector('#due-date').value     = defaultDueString()

  openForm()
}

//Enables editing for a specific row
const startEdit = function(row) {
  editingId = row._id

  //Updating the existing values with the new ones
  document.querySelector('#task').value         = row.task
  document.querySelector('#created-date').value = row.created_date
  document.querySelector('#due-date').value     = row.due_date

  document.querySelector('#submit-button').textContent = 'Save changes'

  openForm()
  setStatus('Editing "' + row.task + '".', false)
}

//Handles the submit button
const submit = async function(event) {
  // stop form submission from trying to load
  // a new .html page for displaying results...
  // this was the original browser behavior and still
  // remains to this day
  event.preventDefault()

  const payload = {
    task:         document.querySelector('#task').value,
    created_date: document.querySelector('#created-date').value,
    due_date:     document.querySelector('#due-date').value
  }

  let ok = false

  //If nothing is being edited something is being added
  if (editingId === null) {
    ok = await send('/add', payload)
    if (ok) {
      setStatus('Added "' + payload.task + '".', false)
    }
  }
  //Something is getting edited
  else {
    payload.id = editingId
    ok = await send('/modify', payload)
    if (ok) {
      setStatus('Saved changes to "' + payload.task + '".', false)
    }
  }

  if (ok) {
    closeForm()
  }
}

//Sets the website status
const setStatus = function(message, isError) {
  const status = document.querySelector('#status')

  status.textContent = message
  status.className   = isError ? 'error' : ''
}

//Setting behavior for buttons on the site
window.onload = async function() {
  document.querySelector('#todo-form').onsubmit = submit

  document.querySelector('#add-button').onclick = toggleForm

  document.querySelector('#cancel-button').onclick = function() {
    closeForm()
    setStatus('', false)
  }

  closeForm()

  //Breaks the query string into key/value pairs
  const params = new URLSearchParams(window.location.search)

  //Using URLSearchParams to allow 'new' to be used
  if (params.get('new') === '1') {
    setStatus('New account created. Welcome!', false)

    //Rewrites address bar so the new account message only shows once
    history.replaceState(null, '', '/')
  }

  //Collects to do list data and renders it
  const response = await fetch('/data')

  renderList(await response.json())
}
