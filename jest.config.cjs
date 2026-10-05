module.exports = {
  roots: ['<rootDir>/test'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|js)$': '@swc/jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
