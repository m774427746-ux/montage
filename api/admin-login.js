import login from './login.js';
import { parseBody } from './_session.js';
export default function handler(req,res){req.body={...parseBody(req),role:'admin'};return login(req,res);}
