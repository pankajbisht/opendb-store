## What is opendb-store?

> A lightweight utility to manage browser storage (localStorage, sessionStorage, and cookies) with advanced features. Easily configure namespaces, key trimming, and data expiry.

## Core Database Object Method

> local - Contain localStorage methods

> session - Contain sessionStorage methods

## Installation Guide
```
npm i opendb-store
```

## Import opendb-store in Your Project
```
import db from 'opendb-store'

db.local.set('libname', 'OpenDB Store');
console.log('Welcome to: ', db.local.get('libname'));
```

## Local Storage

> LocalStorage is a web storage that allows websites to store data persistently on a user's browser.

```
db.local.methodname
```

## Session Storage

> SessionStorage is a web storage that stores data for the duration of a page session and is cleared when the browser or tab is closed.

```
db.session.methodname
```

## Browser Support

Supports modern browsers including Chrome, Firefox, Safari, and Edge.

## Demonstrating LocalStorage and SessionStorage with an Example

```
<!DOCTYPE html>
<html lang="en">
<head>
   <title>opendb store</title>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/opendb-store@1.1.0/dist/opendb-umd.min.js"></script>
  <script>
	(function () {
	  db.local.set('name', 'opendb store');
	  console.log(db.local.get('name'));
	}());
  </script>
</body>
</html>
```

## Key Changes from the Old Approach

- Powerful Method: Enhanced functionality.
- ES6: Modern JavaScript features.
- Modular: Reusable and maintainable code.
- Namespacing: Organized and conflict-free.

For further details, see the [old-approach](https://github.com/pankajbisht/openDB/tree/v1-opendb) documentation.

## List of Local and Session Storage Methods

### set(key: string, value: any): void
Stores data in local or session storage with a key and value.
Example:
```javascript

db.local.set('libname', 'OpenDB Store'); // Set simple value
db.local.set('object', { name: 'OpenDB Store', version: 'x.y.z' }); // Set Object Value
db.local.set('array', ['OpenDB Store', 'x.y.z']); // Set Array Value
db.local.set('expiringKey', 'It will expire', { expire: 1 * 1000 }); // Set simple value expire after 1 second

// for session storage
db.session.set('libname', 'OpenDB Store'); // Set simple value inside session storage
```

### get(key: string, defaultValue: any): any
Retrieves data from local or session storage by key. Returns defaultValue if the key does not exist.

```javascript

// Get Simple Value
console.log('Welcome to: ', db.local.get('libname')); // OpenDB Store

// Get Object Value
console.log('Object: ', db.local.get('object'));
// Or
const { name, version } = db.local.get('object');
console.log(name, version);

// Get Array Value
console.log('Array: ', db.local.get('array'));

// Get defaultValue
db.local.get('missingKey', {}); // {} by default it will null

console.log('Before(2 sec) expiringKey', db.local.get('expiringKey'))

(async () => {
    await new Promise((resolve) => setTimeout(resolve, 2 * 1000));
    console.log('After(2 sec) expiringKey', db.local.get('expiringKey')); // will get default value
})();

```

### has(key: string): boolean
check whether a specified key exists in local or session storage

```javascript

// Checks if a key exists in local storage.
console.log(db.local.has('libname')); // true
console.log(db.local.has('missingkey')); // false
```

### remove(key: string): any | null
remove a specific item from local or session storage

```javascript

// Removes a value from storage.
db.local.remove('libname');
```

### clear(): void
Empty the entire storage.

```javascript

// Clears all data from local storage
db.local.clear();
```

### size(key: string, options={ format?: "B" | "KB" | "MB"; unit?: boolean }): string | number
Get the size of the value for a specific key.

```javascript
const sizeInBytes = 2 * 1024 * 1024; // 2 MB
const largeString = "A".repeat(sizeInBytes); // Create a 2MB string
const largeObject = { data: largeString };

db.local.set('largeObj', largeObject);
console.log(db.local.size('largeObj')); // 2097163 (raw bytes)
console.log(db.local.size('largeObj', { format: 'KB', unit: true })); // 2.00 MB
```

### free(options={ format?: "B" | "KB" | "MB"; unit?: boolean }): string | number
Get the remaining free space in local or session storage.

```javascript

console.log(db.local.free()); // raw bytes
console.log(db.local.free({ format: 'mb', unit: true })); // e.g., "3.00 MB"
```

### capacity(options={ format?: "B" | "KB" | "MB"; unit?: boolean }): string | number
Get the total capacityof local or session storage.

```javascript

console.log(db.local.capacity()); // raw bytes
console.log(db.local.capacity({ format: 'mb', unit: true })); // e.g., "5.00 MB"
```
