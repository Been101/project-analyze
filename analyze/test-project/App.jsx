import React from "react";
import Header from "./Header";
import Footer from "./Footer";
import { sayHello } from "./utils";

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
