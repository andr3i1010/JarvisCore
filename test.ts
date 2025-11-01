const messages = []

const modules = [
  {
    name: "websearch",
    params: {
      query: "What to search for",
      engine: "The search engine used"
    },
    passToClient: false
  }
]

for (let i = 0; i < modules.length; i++) {
  let sysPrompt = `${modules[i].name} module: Can be called by using the main tool call structure. Make sure to customize the parameters as following: 
cmd: ${modules[i].name}
payload:\n  [parameters]
passToClient: ${modules[i].passToClient}`;
  let paramsString = "";
  const params = modules[i].params as Record<string, string>;
  const paramKeys = Object.keys(params);
  for (let j = 0; j < paramKeys.length; j++) {
    const key = paramKeys[j];
    if (j === 0) paramsString += `${key}: ${params[key]}`;
    else paramsString += `\n  ${key}: ${params[key]}`;
  }
  sysPrompt = sysPrompt.replace("[parameters]", paramsString.trim());
  messages.push({ role: "system", content: sysPrompt });
}

console.log(messages)
console.log(messages[0].content)