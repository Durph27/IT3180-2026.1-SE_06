import test from 'node:test'
import assert from 'node:assert/strict'
import { hasValidUsernameChars } from './username.js'

test('usernames reject Vietnamese diacritics in composed and decomposed form', () => {
  for (const name of ['nguyenvana', 'nguyen.van-a_01', 'Admin2']) assert.equal(hasValidUsernameChars(name), true, name)
  for (const name of ['nguyễnvăn', 'đặng', 'nguyễn', 'co dau', '']) assert.equal(hasValidUsernameChars(name), false, name)
})
