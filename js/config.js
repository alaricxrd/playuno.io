window.PLAY_UNO_CONFIG = Object.freeze({
  API_BASE: "",
  // Set your Dropbox link here. Change ?dl=0 to ?dl=1 for direct download.
  // Example: "https://www.dropbox.com/s/YOURFILEID/PlayUno-Setup.exe?dl=1"
  DOWNLOAD_URL: "https://www.dropbox.com/scl/fi/2533jlzx507u9aqx2eu97/PlayUno-Setup.exe?rlkey=ltdmzy99jpdaq4ulinv91ea6w&st=kvee0zy2&dl=1",
  MAX_PLAYERS: 10,
  ROOM_PREFIX: "UNO-",
  
  // Special usernames that are treated as "downloaded app" users
  // These users can use voice chat and won't block game start
  // Add usernames in lowercase
  PRIVILEGED_USERS: ["diana7", "yyy", "yys"]
});
