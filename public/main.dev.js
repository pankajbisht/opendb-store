import db from "../src/index.js"

db.local.set('name', 'opendb');
console.log(db.local.get('name'))

(async() => {
    db.local.set('expiringKey', 'value', { expire: 500 });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const result = db.local.get('expiringKey');

    console.log("The result is:", result);
})()
