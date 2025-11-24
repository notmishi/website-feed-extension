// Management of Bookmark Folders

// Check if folder exists: if not, create it.
async function getOrCreateFolder(name, parentId) {
  const children = await browser.bookmarks.getChildren(parentId);

  const existing = children.find(
    (child) => child.type === "folder" && child.title === name,
  );

  if (existing) return existing;

  return browser.bookmarks.create({
    title: name,
    parentId,
  });
}

// Create and sort profile folders
async function initProfileFolder(profile) {
  const root_parent = "unfiled_____";
  const website_feed = await getOrCreateFolder("Website Feed", root_parent);
  const profileFolder = await getOrCreateFolder(profile, website_feed.id);
  await sortProfileFolders(website_feed.id);
  return profileFolder.id;
}

async function sortProfileFolders(parentId) {
  const children = await browser.bookmarks.getChildren(parentId);
  const profileFolders = children.filter(
    (c) => c.type === "folder" && /^[1-4]$/.test(c.title),
  );
  const sorted = [...profileFolders].sort(
    (a, b) => Number(a.title) - Number(b.title),
  );

  let alreadySorted = profileFolders.every(
    (folder, i) => folder.id === sorted[i]?.id,
  );

  if (alreadySorted) return;
  for (let i = 0; i < sorted.length; i++) {
    await browser.bookmarks.move(sorted[i].id, { index: i });
  }
}

// Actual Bookmarks

// Check if the current site is bookmarked
async function currentSiteBookmarked(folderId, tab) {
  const children = await browser.bookmarks.getChildren(folderId);
  return children.find((item) => item.url === tab.url);
}

// Toggle bookmark state on current profile

async function toggleCurrentSite(folderId, tab) {
  const existing = await currentSiteBookmarked(folderId, tab);
  if (existing) {
    await browser.bookmarks.remove(existing.id);
    return { removed: true };
  }

  await browser.bookmarks.create({
    parentId: folderId,
    title: tab.title,
    url: tab.url,
  });

  return { created: true };
}

// Elements Setup

let btn = document.getElementById("button");
let profileList = document.getElementById("profile");

async function setButtonState() {
  let givenProfile = document.getElementById("profiles").value;
  profileFolderId = await initProfileFolder(givenProfile);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  profileFolderId = await initProfileFolder(givenProfile);
  const bookmarked = await currentSiteBookmarked(profileFolderId, tab);
  if (bookmarked) {
    btn.textContent = "Remove site from list";
  } else {
    btn.textContent = "Add site to list";
  }
}

setButtonState();

btn.addEventListener("click", async function () {
  let givenProfile = document.getElementById("profiles").value;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  profileFolderId = await initProfileFolder(givenProfile);

  if (!tab || !tab.url) return;

  await toggleCurrentSite(profileFolderId, tab);
  setButtonState();
});

function storeOptions() {
  function getProfile() {
    return (profile = document.getElementById("profiles").value);
  }
  profile = getProfile();
  browser.storage.local.set({
    profile,
  });
}

function updateUI(restoredOptions) {
  const selectList = document.getElementById("profiles");
  selectList.value = restoredOptions.profile;
}

function onError(e) {
  console.error(e);
}

const gettingStoredOptions = browser.storage.local.get();
gettingStoredOptions.then(updateUI, onError);
document
  .getElementById("profiles")
  .addEventListener("click", async function () {
    storeOptions();
    setButtonState();
  });
