// Uses the sibling API's existing SQL helpers; never reads production env files.
const path = require('node:path');
const api = path.resolve(__dirname, '../../../api-deafcs');
const base = require(path.join(api, 'package.json')).jest;
module.exports = {
  ...base,
  rootDir: path.join(api, 'src'),
  roots: [__dirname],
  transform: { '^.+\\.(t|j)s$': [path.join(api, 'node_modules/ts-jest'), { tsconfig: path.join(api, 'tsconfig.json') }] },
  testTimeout: 600000,
};
