declare module 'tp-link-tapo-connect' {
  export function loginDevice(email: string, password: string, ip: string): Promise<any>;
}
