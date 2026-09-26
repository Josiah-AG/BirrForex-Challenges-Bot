import axios from 'axios';
import {trackVpsRequest} from './workloadTelemetry';
// Used only by VPS clients, never installed as a global HTTP interceptor.
export default {
 get: async (url:string,options?:any) => trackVpsRequest(url,()=>axios.get(url,options),r=>({status:r.status,data:r.data})),
 post: async (url:string,data?:any,options?:any) => trackVpsRequest(url,()=>axios.post(url,data,options),r=>({status:r.status,data:r.data})),
};
