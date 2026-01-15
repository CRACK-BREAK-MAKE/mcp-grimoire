/* eslint-disable */
// @ts-nocheck

// 1. Unused variable
const unusedVar = 'test';

// 2. any type
const badType: any = 'fail';

// 3. Missing explicit return type
function noReturnType(x) {
  return x + 1;
}

// 4. var instead of const/let
var oldStyle = 'bad';

// 5. Unsafe any operations
const obj: any = {};
obj.nonExistent.property;

// 6. Non-null assertion without check
const maybeNull: string | null = null;
const definitelyNotNull = maybeNull!;

// 7. Empty interface
interface EmptyInterface {}

// 8. Implicit any in catch
try {
  throw new Error();
} catch (e) {
  console.log(e.message);
}

// 9. console.log
console.log('debug output');

// 10. No explicit function return type
async function asyncNoReturn(x: number) {
  return x * 2;
}
