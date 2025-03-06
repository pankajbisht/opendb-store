import db from "../dist/opendb-esm.min.js"

// Set an item for testing:
db.local.set('myKey', { name: 'Alice', age: 30 });

// Get the size of the value for a specific key:
console.log(db.local.size('myKey')); // e.g., 105 (raw bytes)
console.log(db.local.size('myKey', { format: 'KB', unit: true })); // e.g., "0.00 MB"

// Get the remaining free space in localStorage:
console.log(db.local.free()); // raw bytes
console.log(db.local.free({ format: 'mb', unit: true })); // e.g., "4.95 MB"

// Get the total capacity:
console.log(db.local.capacity()); // raw bytes (e.g., 5242880 for 5 MB)
console.log(db.local.capacity({ format: 'MB', unit: true })); // "5.00 MB"


const sizeInBytes = 2 * 1024 * 1024; // 2 MB
const largeString = "A".repeat(sizeInBytes); // Create a 2MB string
const largeObject = { data: largeString };

db.local.set('largeObj', largeObject);
console.log(db.local.size('largeObj')); // e.g., 105 (raw bytes)
console.log(db.local.size('largeObj', { format: 'mb', unit: true })); // e.g., "0.00 MB"

// Get the remaining free space in localStorage:
console.log(db.local.free()); // raw bytes
console.log(db.local.free({ format: 'mb', unit: true })); // e.g., "4.95 MB"


console.log(db.local.capacity()); // raw bytes
console.log(db.local.capacity({ format: 'mb', unit: true })); // e.g., "5.00 MB"
console.log(db.session.free({ format: 'mb', unit: true })); // e.g., "5.00 MB"
