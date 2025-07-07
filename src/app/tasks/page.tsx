import React from "react";

async function page() {
  const response = await fetch("http://localhost:3000/api/tasks");
  const tasks = await response.json();
  console.log(tasks);
  return <div>page</div>;
}

export default page;
