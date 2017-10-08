'use strict';

const Homey = require('homey');
const dateformat = require('dateformat');
var FeedMe = require('feedme');
var http = require('http');
var https = require('https');
var httpmin = require ('http.min');
var data = []; //array with media-objects
var urllist = []; //array with {name,url} feeds from settings
var replText;

class Podcast extends Homey.App {
	
	onInit() {
		this.log('Podcast starting');
		
		getsettings().then(function(results) {
			console.log("settings read");
			urllist=results;
			console.log(urllist);
			readfeeds().then(function(results) {
				console.log("feeds read");
				data=results;
				Homey.ManagerMedia.requestPlaylistsUpdate();
			})	
		});

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
		//data=[];
		readfeeds().then(function(results) {
			console.log('feeds read from polling');
			console.log(results);
			Homey.ManagerMedia.requestPlaylistsUpdate();
		})	
	}, 30000);
};

async function readfeeds() {
	var a = await new Promise(function(resolve,reject){
		var temparray = [];
		for(var i = 0; i < urllist.length; i++) {
			var obj = urllist[i];
			readfeed(obj.url).then(function(item) {
				console.log("feed read");
				console.log(item);
				temparray.push (item);
				console.log("temparray is");
				console.log (temparray);
			}) 

		};
		console.log(temparray);
		resolve (temparray);
	});
	return (a);
}
	
async function readfeed(url) {
	var b = await new Promise(function(resolve,reject){
			http.get(url, function(res) {
				var parser = new FeedMe(true);
				res.pipe(parser);
				parser.on('end', function() {
					var pl = parser.done();
					var result = {
						type: 'playlist',
						id: pl.title,
						title: pl.title			,
						tracks: parseTracks(pl.items) || false,
					};
				resolve(result);
				});	
			});		
	});
	return (b);
};

//get name and url list from settings and create array
function getsettings() {
	return new Promise(function(resolve,reject){
		var replText = Homey.ManagerSettings.get('podcasts');		
		var list = []
		if (typeof replText === 'object') {
			Object.keys(replText).forEach(function (key) {
				list.push( {"name":key,"url":replText[key]})
				return list;
			});
		resolve(list);	
		}
	})
}	
	
	
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