// Stops a deploy that would put one project's site on another project: runs before the site is built,
// as the first step of the hosting "predeploy" in firebase.json. The Firebase CLI gives it the project it
// is deploying to as GCLOUD_PROJECT; the app was built for the project in .env.local. They must match.
import { existsSync } from 'node:fs'

const settingsFile = '.env.local'
const cliProject = (process.env.GCLOUD_PROJECT ?? '').trim()

function stop(message) {
  console.error(`\nStopped before building: ${message}\n`)
  process.exit(1)
}

if (!existsSync(settingsFile)) {
  stop(`${settingsFile} doesn't exist, so there is no project to deploy this build to.\nCopy .env.example to ${settingsFile} and fill in your Firebase values (docs/SELF-HOSTING.md).`)
}
process.loadEnvFile(settingsFile)

const settingsProject = (process.env.VITE_FIREBASE_PROJECT_ID ?? '').trim()
if (!settingsProject) {
  stop(`VITE_FIREBASE_PROJECT_ID is empty in ${settingsFile}.\nSet it to the id of your Firebase project.`)
}
if (!cliProject) {
  stop(`the Firebase CLI didn't say which project it is deploying to (GCLOUD_PROJECT is empty).\nRun this through "firebase deploy", with a project chosen by "firebase use" or --project.`)
}
if (settingsProject !== cliProject) {
  stop(`${settingsFile} says the app is for "${settingsProject}", but the Firebase CLI is deploying to "${cliProject}".\nFix it by either editing VITE_FIREBASE_PROJECT_ID in ${settingsFile}, or running "firebase use ${settingsProject}" (or passing --project ${settingsProject}).`)
}
console.log(`Deploy target: ${cliProject} (matches ${settingsFile}).`)
