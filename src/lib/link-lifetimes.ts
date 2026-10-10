// How long signed storage links stay valid, in seconds. Files are private; links are short on purpose.
// Material links are signed per click by /files/<id> and used at once (a redirect), so a minute is plenty.
export const MATERIAL_LINK_SECONDS = 60;
export const AVATAR_LINK_SECONDS = 60 * 60;
