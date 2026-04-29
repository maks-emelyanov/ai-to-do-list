import '@firebase/auth';

declare module '@firebase/auth' {
  export { getReactNativePersistence } from '@firebase/auth/dist/rn/index.rn';
}
