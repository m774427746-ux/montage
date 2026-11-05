import manage from './manage.js';
export default function handler(req,res){req.query={action:'logout'};return manage(req,res);}
