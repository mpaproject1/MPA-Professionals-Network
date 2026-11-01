import {generateKeyPairSync} from "node:crypto";

const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
const pub=publicKey.export({format:"jwk"});
const priv=privateKey.export({format:"jwk"});
const publicBytes=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,"base64url"),Buffer.from(pub.y,"base64url")]);
console.log("# Store these values in the API host environment or repository-root .env (chmod 600). Never commit the private key.");
console.log("WEB_PUSH_VAPID_PUBLIC_KEY="+publicBytes.toString("base64url"));
console.log("WEB_PUSH_VAPID_PRIVATE_KEY="+priv.d);
console.log("WEB_PUSH_SUBJECT=mailto:replace-with-your-monitored-admin-contact");
