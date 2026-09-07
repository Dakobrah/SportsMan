/**
 * Which build this is.
 *
 * Used only to gate UI that cannot work in a browser -- saving a file needs
 * a native dialog. It is NOT what selects the database: that is decided by
 * which entry point ran, so neither build carries the other's code.
 */
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';
