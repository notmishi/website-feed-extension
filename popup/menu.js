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
    (c) => c.type === "folder" && /^[1-4]$/.test(c.title), // this will probably be hostile to fix for custom profile names
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

// Element init

let addButton = document.getElementById("addButton");
let randomButton = document.getElementById("randomButton");
let nextButton = document.getElementById("nextButton");
let prevButton = document.getElementById("prevButton");
let profileList = document.getElementById("profiles");
let pageInfo = document.getElementById("pageInfo");
let pageReq = document.getElementById("pageReq");

reloadStuff();
async function reloadStuff() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  await setAddButtonState(tab);
  await updatePageInfo(tab);
}

// AddButton update function

async function setAddButtonState(tab) {
  let givenProfile = profileList.value;
  profileFolderId = await initProfileFolder(givenProfile);
  const bookmarked = await currentSiteBookmarked(profileFolderId, tab);
  if (bookmarked) {
    addButton.textContent = "Remove site from list";
  } else {
    addButton.textContent = "Add site to list";
  }
}

// AddButton click function

addButton.addEventListener("click", async function () {
  let givenProfile = profileList.value;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  profileFolderId = await initProfileFolder(givenProfile);

  if (!tab || !tab.url) return;

  await toggleCurrentSite(profileFolderId, tab);
  setAddButtonState(tab);
  updatePageInfo(tab);
});

// RandomButton function

function shuffle(arr) {
  arr = arr.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function openRandomFromProfile(profile) {
  const folderId = await initProfileFolder(profile);
  const children = await browser.bookmarks.getChildren(folderId);
  const bookmarks = children.filter((child) => child.url);
  if (bookmarks.length === 0) {
    console.log("No bookmarks in this profile.");
    return;
  }

  const storageKey = `randomBag_${profile}`;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  let bag = await browser.storage.local.get(storageKey);
  bag = bag[storageKey] || {};

  if (bag.date !== today || !Array.isArray(bag.order)) {
    bag = {
      date: today,
      order: shuffle(bookmarks.map((b) => b.id)),
      index: 0,
    };
  }

  if (bag.index >= bag.order.length) {
    bag.order = shuffle(bookmarks.map((b) => b.id));
    bag.index = 0;
  }

  const nextId = bag.order[bag.index++];
  await browser.storage.local.set({ [storageKey]: bag });

  console.log(bag);

  const target = bookmarks.find((b) => b.id === nextId);
  if (!target) return;

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  const bookmarked = currentSiteBookmarked(folderId, tab);
  if (bookmarked) {
    browser.tabs.update(tab.id, { url: target.url });
  } else {
    browser.tabs.create({ url: target.url });
  }

  setAddButtonState(target);
  updatePageInfo(target);
}

// RandomButton click function

randomButton.addEventListener("click", async function () {
  let givenProfile = profileList.value;
  await openRandomFromProfile(givenProfile);
});

// Sequencing

async function getPageIndex(folderId, tab) {
  const bookmarked = await currentSiteBookmarked(folderId, tab);
  if (!bookmarked) {
    return "N/A";
  }

  const children = await browser.bookmarks.getChildren(folderId);
  const bookmarks = children.filter((child) => child.url);

  const pageIndex = bookmarks.findIndex((b) => b.url === tab.url);

  return pageIndex;
}

async function getPageInfo(folderId, tab) {
  const children = await browser.bookmarks.getChildren(folderId);
  const bookmarks = children.filter((child) => child.url);

  return `of ${bookmarks.length}`;
}

async function updatePageInfo(tab) {
  let givenProfile = profileList.value;
  let profileFolderId = await initProfileFolder(givenProfile);

  let pageIndex = await getPageIndex(profileFolderId, tab);
  if (pageIndex != "N/A") {
    pageIndex++;
  }
  pageReq.value = pageIndex;
  const pageLocation = await getPageInfo(profileFolderId, tab);
  pageInfo.textContent = `${pageLocation}`;
}

prevButton.addEventListener("click", async function () {
  let givenProfile = profileList.value;
  let profileFolderId = await initProfileFolder(givenProfile);

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const pageIndex = await getPageIndex(profileFolderId, tab);

  const children = await browser.bookmarks.getChildren(profileFolderId);
  const bookmarks = children.filter((item) => item.url);

  let target;
  if (pageIndex == "N/A") {
    target = bookmarks[0];
    await browser.tabs.update(tab.id, { url: target.url });
  } else {
    target = bookmarks[pageIndex - 1];
    await browser.tabs.update(tab.id, { url: target.url });
  }

  setAddButtonState(target);
  updatePageInfo(target);
});

nextButton.addEventListener("click", async function () {
  let givenProfile = profileList.value;
  let profileFolderId = await initProfileFolder(givenProfile);

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const pageIndex = await getPageIndex(profileFolderId, tab);

  const children = await browser.bookmarks.getChildren(profileFolderId);
  const bookmarks = children.filter((item) => item.url);

  let target;

  if (pageIndex == "N/A") {
    target = bookmarks[bookmarks.length - 1];
    await browser.tabs.update(tab.id, { url: target.url });
  } else {
    target = bookmarks[pageIndex + 1];
    await browser.tabs.update(tab.id, { url: target.url });
  }

  setAddButtonState(target);
  await updatePageInfo(target);
});

// Page Goto Input

async function goToBookmark(index, folderId) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const children = await browser.bookmarks.getChildren(folderId);
  const bookmarks = children.filter((item) => item.url);
  let target = bookmarks[index];
  console.log(target.url);
  await browser.tabs.update(tab.id, { url: target.url });
  setAddButtonState(target);
  await updatePageInfo(target);
}

document
  .getElementById("form")
  .addEventListener("submit", async function (event) {
    event.preventDefault();
    let givenProfile = profileList.value;
    // let profileFolderId = await initProfileFolder(givenProfile);
    profileFolderId = await initProfileFolder(givenProfile);

    let givenValue = pageReq.value;

    if (givenValue == "N/A") return;

    if (isNaN(givenValue)) {
      goToBookmark(0, profileFolderId);
      return;
    }

    const children = await browser.bookmarks.getChildren(profileFolderId);
    const bookmarks = children.filter((item) => item.url);

    givenValue = Math.floor(givenValue);
    if (givenValue < 1) {
      goToBookmark(0, profileFolderId);
      return;
    }

    if (givenValue > bookmarks.length) {
      goToBookmark(bookmarks.length - 1, profileFolderId);
      return;
    }

    goToBookmark(givenValue - 1, profileFolderId);
  });

// Option Storage

// Save function

function storeOptions() {
  function getProfile() {
    return (profile = profileList.value);
  }
  profile = getProfile();
  browser.storage.local.set({
    profile,
  });
}

// Update function

function updateUI(restoredOptions) {
  const selectList = profileList;
  selectList.value = restoredOptions.profile;
}

function onError(e) {
  console.error(e);
}

// Click event for profile list

const gettingStoredOptions = browser.storage.local.get();
gettingStoredOptions.then(updateUI, onError);
profileList.addEventListener("click", async function () {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  storeOptions();
  setAddButtonState(tab);
  updatePageInfo(tab);
});
