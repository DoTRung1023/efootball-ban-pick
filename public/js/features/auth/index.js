/* ============================================================
   auth — the public surface other features may use

   The sign-in page's own modules (`signInForm`, `signUpModal`,
   `signInBackdrop`) are deliberately **not** re-exported here: there is no
   bundler, so anything this barrel names is a module the browser fetches on
   every page that imports it.
   ============================================================ */

export { initUserMenu } from "./userMenu.js";
export {
  openEditProfile,
  closeEditProfile,
  clearEpErrors,
  initEditProfile,
} from "./editProfile.js";
