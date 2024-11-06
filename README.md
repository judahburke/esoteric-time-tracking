# Esoteric Time Tracker

Created via ai (<https://claude.ai/chat/8d11aaf4-647c-4119-a817-ae5c6752dea3>)

## Setup

```node
npm i
```

## Operation

```node
npm build
```

```node
npm start
```

## FAQs

### Manual Edits

If you need to delete something manually from the database, open up the console and run this command

```js
const request = indexedDB.open('WorkTimeTrackerDB', 1);let db;request.onsuccess = () => {db = request.result;};
db.transaction(['timeEntries'], 'readonly').objectStore('timeEntries').getAll();
```

Get the appropriate id and run this command, changing `id` to the appropriate value

```js
const id = 12345
const request = indexedDB.open('WorkTimeTrackerDB', 1);let db;request.onsuccess = () => {db = request.result;};
db.transaction(['timeEntries'], 'readwrite').objectStore('timeEntries').delete(id);
```
