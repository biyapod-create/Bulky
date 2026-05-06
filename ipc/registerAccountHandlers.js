const { validateDesktopSignIn, validateDesktopSignUp } = require('./validators');

function registerAccountHandlers({
  safeHandler,
  desktopAccountService
}) {
  safeHandler('account:getStatus', async () => {
    if (!desktopAccountService) {
      return { error: 'Desktop account service is not initialized' };
    }

    return desktopAccountService.getStatus();
  });

  safeHandler('account:signIn', async (e, credentials) => {
    if (!desktopAccountService) {
      return { error: 'Desktop account service is not initialized' };
    }

    const validated = validateDesktopSignIn(credentials);
    if (validated.error) {
      return { error: validated.error };
    }

    return desktopAccountService.signInWithPassword(validated.value);
  });

  safeHandler('account:signUp', async (e, payload) => {
    if (!desktopAccountService) {
      return { error: 'Desktop account service is not initialized' };
    }

    const validated = validateDesktopSignUp(payload);
    if (validated.error) {
      return { error: validated.error };
    }

    return desktopAccountService.signUpWithPassword(validated.value);
  });

  safeHandler('account:refresh', async () => {
    if (!desktopAccountService) {
      return { error: 'Desktop account service is not initialized' };
    }

    return desktopAccountService.refreshSession();
  });

  safeHandler('account:signOut', async () => {
    if (!desktopAccountService) {
      return { error: 'Desktop account service is not initialized' };
    }

    return desktopAccountService.signOut();
  });

  safeHandler('account:updateProfile', async (e, payload) => {
    if (!desktopAccountService) return { error: 'Desktop account service is not initialized' };
    const fullName = String(payload?.fullName ?? '').trim();
    const workspaceName = String(payload?.workspaceName ?? '').trim();
    return desktopAccountService.updateProfile({ fullName, workspaceName });
  });

  safeHandler('account:changePassword', async (e, payload) => {
    if (!desktopAccountService) return { error: 'Desktop account service is not initialized' };
    const currentPassword = String(payload?.currentPassword ?? '');
    const newPassword = String(payload?.newPassword ?? '');
    return desktopAccountService.changePassword({ currentPassword, newPassword });
  });
}

module.exports = registerAccountHandlers;
