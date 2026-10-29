const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const prelude = source.split('\n').slice(0, 23).join('\n');
const store = new Map();
const context = vm.createContext({
  console, Date, Math, Number, Array, String, JSON, Intl,
  localStorage: {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, value)
  },
  alert: () => {},
  globalThis: { crypto: { randomUUID: () => String(Math.random()) } }
});
vm.runInContext(prelude, context);

const evalFn = (name, obj) => vm.runInContext(name + '(' + JSON.stringify(obj) + ')', context);
const calculate = doc => JSON.parse(vm.runInContext('JSON.stringify(totals(' + JSON.stringify(doc) + '))', context));
const base = {
  kind: 'invoice', status: 'sent', due: '2099-12-31',
  lines: [{ qty: 2, price: 80, taxable: true }],
  discount: 0, taxRate: 10, payments: []
};

test('invoice math: quantity, tax, and balance', () => {
  assert.deepEqual(calculate(base), { sub: 160, disc: 0, vat: 16, total: 176, paid: 0, due: 176 });
});

test('invoice math: percentage discount before tax and partial payment', () => {
  assert.deepEqual(calculate({ ...base, discount: 10, payments: [{amount:80}] }),
    { sub:160, disc:16, vat:14.4, total:158.4, paid:80, due:78.4 });
});

test('invoice math: only taxable items attract tax', () => {
  assert.deepEqual(calculate({ ...base, lines:[
    {qty:1,price:100,taxable:true}, {qty:1,price:100,taxable:false}
  ], discount:10 }), {sub:200,disc:20,vat:9,total:189,paid:0,due:189});
});

test('document status follows payments and due date', () => {
  assert.equal(evalFn('docStatus', base), 'sent');
  assert.equal(evalFn('docStatus', {...base,payments:[{amount:100}]}), 'partial');
  assert.equal(evalFn('docStatus', {...base,payments:[{amount:176}]}), 'paid');
  assert.equal(evalFn('docStatus', {...base,due:'2020-01-01'}), 'overdue');
  assert.equal(evalFn('docStatus', {...base,status:'draft'}), 'draft');
});

test('initial workspace is saved in browser storage', () => {
  assert.ok(store.has('invoice-studio-v1'));
});
