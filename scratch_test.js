const fs = require('fs')

function fixImports(path) {
  let content = fs.readFileSync(path, 'utf8')
  
  content = content.replace(/import bcrypt from "bcryptjs"[\r\n]+/g, '')
  content = content.replace(/import \{ compareApiKeyCached \} from "@\/lib\/api-key-cache"[\r\n]+/g, 'import { authenticateStoreHeaders } from "@/lib/gateway-auth"\n')
  
  fs.writeFileSync(path, content)
}

fixImports('app/api/gateway/capture/route.ts')
fixImports('app/api/gateway/void/route.ts')
console.log("Imports fixed!")
