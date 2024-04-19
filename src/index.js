// cloudflare_worker.js
const cheerio = require('cheerio');

async function fetchHtml(url) {
    try {
	const response = await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0'}});
	const html = await response.text();
	return html;
    } catch (error) {
	console.error('Error fetching HTML:', error);
	throw error;
    }
}

async function fetchVideoDetails(videoId) {
    try {
	const url = `https://www.youtube.com/watch?v=${videoId}`;
	const html = await fetchHtml(url);
	const $ = cheerio.load(html);
	
	const title = $('meta[name="title"]').attr('content');
	const description = $('meta[name="description"]').attr('content');
	const thumbnailUrl = $('meta[property="og:image"]').attr('content');
	const channelName =  $('link[itemprop="name"]').attr('content');
	
	if (title && description && thumbnailUrl) {
	    return {
		id: videoId,
		title,
		description,
		thumbnailUrl,
		channelName
	    };
	}

	throw new Error('Video details not found');
    } catch (error) {
	console.error('Error fetching video details:', error);
	throw error;
    }
}

function findValuesByKey(obj, key) {
  const results = [];

  function traverse(obj) {
    if (obj.hasOwnProperty(key)) {
      results.push(obj[key]);
    }

    for (let prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        if (Array.isArray(obj[prop])) {
          obj[prop].forEach(traverse);
        } else if (typeof obj[prop] === 'object') {
          traverse(obj[prop]);
        }
      }
    }
  }

  traverse(obj);
  return results;
}

async function fetchPlaylistDetails(playlistId) {
    try {
	const url = `https://www.youtube.com/playlist?list=${playlistId}`;
	const html = await fetchHtml(url);
	const $ = cheerio.load(html);

	const videos = [];

	let data = $('script:contains("var ytInitialData")').html();
	data = data.replace(/var ytInitialData = /, '');
	data = data.replace(/;$/, '');
	data = JSON.parse(data);
	let playlistHeader = findValuesByKey(data, 'playlistHeaderRenderer');
	let playlistTitle = playlistHeader[0].title.simpleText;

	let ownerInfo = findValuesByKey(data, 'ownerText');
	let channelName = ownerInfo[0].runs[0].text;
	
	findValuesByKey(data, 'playlistVideoRenderer').forEach((content) => {
	    let videoId = content.videoId;
	    let lengthSeconds = content.lengthSeconds;
	    let title = content.title.runs[0].text;
	    videos.push({
		videoId,
		title,
		channelName,
		playlistTitle,
		lengthSeconds,
	    })
	});
	
	
	if (playlistTitle && videos.length > 0) {
	    return {
		id: playlistId,
		title: playlistTitle,
		channelName,
		videos,
	    };
	}

	throw new Error('Playlist details not found');
    } catch (error) {
	console.error('Error fetching playlist details:', error);
	throw error;
    }
}

async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith('/video/')) {
	const videoId = path.split('/')[2];
	const videoDetails = await fetchVideoDetails(videoId);
	return new Response(JSON.stringify(videoDetails), {
	    headers: { 'Content-Type': 'application/json' },
	});
    } else if (path.startsWith('/playlist/')) {
	const playlistId = path.split('/')[2];
	const playlistDetails = await fetchPlaylistDetails(playlistId);
	return new Response(JSON.stringify(playlistDetails), {
	    headers: { 'Content-Type': 'application/json' },
	});
    } else {
	return new Response('Invalid request', { status: 400 });
    }
}

addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event.request));
});
