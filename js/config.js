window.PLAY_UNO_CONFIG = Object.freeze({
  API_BASE: "",
  // Set your Dropbox link here. Change ?dl=0 to ?dl=1 for direct download.
  // Example: "https://www.dropbox.com/s/YOURFILEID/PlayUno-Setup.exe?dl=1"
  DOWNLOAD_URL: "https://www.dropbox.com/scl/fi/e1pdwp15nr8fjfqut35xa/PlayUno-Setup.exe?rlkey=ibbmc14cozk5e9s6zvg5qkx88&st=sc2ylp5g&dl=1",
  MAX_PLAYERS: 10,
  ROOM_PREFIX: "UNO-",
  
  // Special usernames that are treated as "downloaded app" users
  // These users can use voice chat and won't block game start
  // Add usernames in lowercase
  PRIVILEGED_USERS: ["diana7", "", ""]
});
