'use strict';

const Homey = require('homey');
const dateformat = require('dateformat');
var FeedMe = require('feedme');
var http = require('http');
var data = '';

class Podcast extends Homey.App {
	
	onInit() {
		this.log('Podcast starting');
		
		//data=readfeed();
		//console.log(data);
		Homey.ManagerMedia.requestPlaylistsUpdate();
		startPollingForUpdates();

		Homey.ManagerMedia.on('getPlaylists', (callback) => {
			console.log('get playlists');
			//console.log(data);
			
			readfeed().then(function(results) {
				console.log(results);
				callback(null, results);
			}).fail(function(err){
				console.log(err);
			});
			
		});		
	}	
}

function startPollingForUpdates() {
	var pollingInterval = setInterval(() => {
		console.log('start polling');
		data=readfeed();
		//console.log(data);
	}, 60000);
};

function readfeed() {
	var str = {};
	http.get('http://feeds.soundcloud.com/users/soundcloud:users:46838518/sounds.rss', function(res) {
		var parser = new FeedMe(true);
		
		res.pipe(parser);
		parser.on('end', function() {
			data = parser.done();
			var result = {
					type: 'playlist',
					id: result.title,
					title: result.title			,
					tracks: parseTracks(result.items) || false,
			};
			//console.log(str);
		});	
	});
	return str;
};

	
	
	
function parseTracks(tracks) {
	const result = [];
	if (!tracks) {
		return result;
	}
	tracks.forEach((track) => {
		const parsedTrack = parseTrack(track);
		parsedTrack.confidence = 0.5;
		result.push(parsedTrack);
		//console.log(parsedTrack);
	});
	return result;
}

function parseTrack(track) {
	return {
		type: 'track',
		id: track.guid.text,
		title: track.title,
		artist: [
			{
				name: track['itunes:author'],
				type: 'artist',
			},
		],
		duration: track.duration || 'unknown',
		artwork: '',
		genre: track.genre || 'unknown',
		release_date: dateformat(track.pubdate, "yyyy-mm-dd"),
		codecs: ['homey:codec:mp3'],
		bpm: '',
		options : [ 
			{
			url : track.enclosure.url
			}
		]
	}
}

module.exports = Podcast;