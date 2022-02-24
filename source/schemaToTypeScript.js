const { compileFromFile } = require('json-schema-to-typescript');
const fs = require('fs')

// compile from file
compileFromFile('./src/schemas/new-orgfile-schema.json')
    .then(ts => fs.writeFileSync('./src/schemas/new-orgfile-schema.d.ts', ts))

compileFromFile('./src/schemas/orgsAsCodeSettings-schema.json')
    .then(ts => fs.writeFileSync('./src/schemas/orgsAsCodeSettings-schema.d.ts', ts))