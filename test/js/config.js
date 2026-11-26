// Settings Ivan may want to change. Everything else lives in the code.
export const CONFIG={
  // Lighting preset used for the Gear shirt in each site theme. Options:
  //   'softbox' (ORB Neutral), 'studio', 'night' (ORB City night), 'uv' (ORB Black light)
  lighting:{light:'studio',dark:'studio'},
  // ORB light intensity per preset family (your saved design uses 110 for Neutral/Studio).
  lightPower:{regular:110,night:100,uv:100},
  // Live meetups endpoint (Cloudflare Worker). Leave empty to use the daily snapshot only.
  meetupsEndpoint:'https://fireside-meetups.vidovici.workers.dev/',
  meetupsSnapshot:'data/meetups.json',
  // Sample meetups for testing: true shows the made-up events in data/sample-meetups.json instead of Luma.
  // Set to false for the live site, so the real Luma calendar is used.
  sampleMeetups:true,
  meetupsSample:'data/sample-meetups.json'
};
