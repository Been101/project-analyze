export function greet(name) {
  return `Hello, ${name}!`;
}

export function sayHello() {
  console.log("Hello from App");
  greet("World");
}
