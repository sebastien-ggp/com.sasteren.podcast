'use strict';

const Homey = require('homey');
const dateformat = require('dateformat');
var FeedMe = require('feedme');
var http = require('http');
var data;
var feedurl='http://feeds.nos.nl/MHOOM';

class Podcast extends Homey.App {
	
	onInit() {
		this.log('Podcast starting');
			readfeed(feedurl).then(function(results) {
			data=results;
			return (data);
			Homey.ManagerMedia.requestPlaylistsUpdate();
		})	
		

		startPollingForUpdates();

		Homey.ManagerMedia.on('getPlaylists', (callback) => {
			console.log('get playlists');
			return callback(null, data);
		});	

		Homey.ManagerMedia.on('getPlaylist', (request, callback) => {
			console.log('get playlist');
			return callback(null, data);
		});

		Homey.ManagerMedia.on('play', (objectid, callback) => {
			console.log(objectid);
			var urlobj= { stream_url : objectid.trackId };
			console.log(urlobj);			
			return callback(null, urlobj);
		});
	}
}

function startPollingForUpdates() {
	var pollingInterval = setInterval(() => {
		console.log('start polling');
		readfeed(feedurl).then(function(results) {
			data=results;
			return (data);
		})	
		Homey.ManagerMedia.requestPlaylistsUpdate();
	}, 120000);
};

function readfeed(url) {
	console.log(url);
	return new Promise(function(resolve,reject){
		http.get(url, function(res) {
			var parser = new FeedMe(true);
			res.pipe(parser);
			parser.on('end', function() {
				var pl = parser.done();
				var result = [{
					type: 'playlist',
					id: pl.title,
					title: pl.title			,
					tracks: parseTracks(pl.items) || false,
				}];
			data=result;
			resolve(result);
			});	
		});
	})
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
	//console.log(result);
	return result;
}

function parseTrack(track) {
	return {
		//type: 'track',
		id: track.enclosure.url,
		title: track.title,
		artist: [
			{
				name: track['itunes:author'],
				type: 'artist',
			},
		],
		//duration: track.duration || 100000,		
		duration: null,
		artwork: '',
		genre: track.genre || 'unknown',
		release_date: dateformat(track.pubdate, "yyyy-mm-dd"),
		codecs: ['homey:codec:mp3'],
		bpm: track.pbm || 0,
		options :  
			{
			url : track.enclosure.url
			}
		
	}
}

module.exports = Podcast;