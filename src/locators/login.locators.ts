/** Minimal login/public selectors for production sanity checks. */
export const L = {
  usernameInput: '#emailOrScreenName, input[type="email"]',
  passwordInput: '#loginPassword, input[type="password"]',
  signInButton: "button[type='submit'], input[type='submit']",
  signInLink: "a[href='/login'], a[href*='sign_in']",
  errorMsg: "[class*='error'], [class*='alert'], [class*='invalid'], [role='alert']",
  userMenu:
    "nav a[href='#']:has(img), [data-scope='avatar'], [data-testid='user-menu'], " +
    "button[aria-label='User menu'], div[class*='avatar'], button[class*='user-menu']",
  logoutLink:
    "a:has-text('Logout'), a:has-text('Log out'), a:has-text('Sign out'), " +
    "a[href*='sign_out']",
  header: 'header[data-reactroot], header:not(#consent-modal-header)',
  projectsNav: "div:text-is('Projects'), span:text-is('Projects'), a:has-text('Projects')",
};
