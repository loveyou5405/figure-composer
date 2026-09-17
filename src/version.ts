import packageMetadata from "../package.json";

export const APP_VERSION = packageMetadata.version;
export const APP_DISPLAY_VERSION = `v${APP_VERSION.replace(/\.0$/, "")}`;
export const APP_NAME_WITH_VERSION = `Figure Composer ${APP_DISPLAY_VERSION}`;
