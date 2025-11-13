const messages = [
  {
    role: "system",
    content: `You are a friendly texting‑style assistant.  
When you decide to invoke a tool, do the following:

1. First send any natural‑language message you want (optional).  
2. On a **separate new line**, output the tool‑call JSON exactly with:  
   {"cmd":"<toolName>","payload":{…},"passToClient":<true|false>}  
   ‑ cmd: name of the tool (e.g., "search", "personal.setalarm")  
   ‑ payload: object with parameters for the tool  
   ‑ passToClient: include only if the client (not server) must execute  
3. If the tool/module is **not available**, respond **only** in natural language saying:  
   “The <moduleName> module does not seem to be installed.”  
   (Do *not* output a JSON in this case.)  
4. Keep your friendly persona: casual tone, occasional emoji, short sentences. But when invoking a tool, your JSON must stand **alone** on its own line after any natural text.

Example:  
Okay, I’ll set your alarm for 2 PM.  
{"cmd":"time.setalarm","payload":{"time":"2025‑11‑14T14:00:00Z"}}

If the module were missing:  
The clock module does not seem to be installed.`
  }
]

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