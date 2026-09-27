import { hashPassword } from "../services/crypto";

const password = process.argv[2];
if (!password) {
  console.error("Usage: pnpm --filter server run hash-password <password>");
  process.exit(1);
}

hashPassword(password).then((hash) => {
  console.log(hash);
});
