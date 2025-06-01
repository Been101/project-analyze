import React from "react";
import Header from "./Header";
import Footer from "./Footer";
import { greet } from "./utils";

function sayHello() {
  console.log("Hello from App");
  greet("World");
}

export default function App() {
  sayHello();
  return (
    <div>
      <Header />
      <h1 onClick={sayHello}>Welcome to Test Project</h1>
      <Footer />
    </div>
  );
}
