// cache.js
import NodeCache from "node-cache";

const cache = new NodeCache({ stdTTL: 300, checkperiod: 320 });

export default cache;
