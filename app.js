var express 	= require('express');
var bodyParser 	= require('body-parser');
var request 	= require('request');
var cheerio 	= require('cheerio');
var path 		= require('path');
var async 		= require('async');
var mongojs 	= require('mongojs');
var parseString = require('xml2js').parseString;
var zlib		= require('zlib');
var db 			= mongojs('poe-help', ['builds']);

var app 		= express();

var pathofexile = 'https://www.pathofexile.com';
var duelistUrl 	= 'https://www.pathofexile.com/forum/view-forum/40/page/';
var marauderUrl = 'https://www.pathofexile.com/forum/view-forum/23/page/';
var rangerUrl 	= 'https://www.pathofexile.com/forum/view-forum/24/page/';
var witchUrl 	= 'https://www.pathofexile.com/forum/view-forum/22/page/';
var templarUrl 	= 'https://www.pathofexile.com/forum/view-forum/41/page/';
var shadowUrl 	= 'https://www.pathofexile.com/forum/view-forum/303/page/';
var scionUrl 	= 'https://www.pathofexile.com/forum/view-forum/436/page/';

var getIP = function(req, res, next){
    var ipAddress = req.connection.remoteAddress;
                                    
    if(ipAddress.substring(0, 7) == '::ffff:'){
        ipAddress = ipAddress.substring(7, ipAddress.length);
    }
    
    req.log = new Date(Date.now()).toString() + ' IP CONNECTING: ' + ipAddress+ ' METHOD: ' + req.method + ' URL: ' + req.originalUrl;
    console.log(req.log);
    next();
}

app.use(getIP)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

var requirePoB = false;
var lastSearch = '';

app.get('/', function(req, res)
{
	console.log(lastSearch);
	res.render('index');
});

app.get('/testing', function(req, res)
{	
	var pob_testing_links = ['https://pastebin.com/Hs6LAx1r'];
	res.send("i want to die.");
	parsePoB(pob_testing_links, function(result){
		
	});
});

app.get('/builds/:class/:patch', function(req, res)
{
	db.builds.find({class: req.params.class, patch: req.params.patch}, function (err, docs) {
		res.render('builds', {
			classChoice: req.params.class,
			builds: docs,
			require: requirePoB
		});
	});
});

app.post('/builds/submit', function(req,res)
{
	requirePoB = false;
	var formClass = req.body.classOption;
	var formPatch = req.body.patch;
	var pobreq = req.body.pobReq;
	if (pobreq == 'on')
		requirePoB = true;
	db.builds.count({class: formClass, patch: formPatch}, function (err, buildsCounter) {
		if (buildsCounter == 0) 
		{
			console.log("Database is empty! Finding new builds...")
			crawl(formClass, formPatch, 1, function(result) {
				console.log(result);
				if (result == 'classError')
					res.redirect('back');
				else if (result == 'pageError')
					res.redirect('back');
				else if (result == 'patchError')
					res.redirect('back');
				else {
					lastSearch = result;
					res.redirect(formClass+'/'+formPatch);	
				}
			});	
		}
		else {
			console.log("Database contains builds. Redirecting to builds page...")
			res.redirect(formClass+'/'+formPatch);
		}
	});
});

function crawl(c, p, pg, callback) 
{
	var error = '';
	var counter = 0;
	var pages = pg;
	if (isNaN(pg) || parseInt(pg) > 9)
		error = 'pageError';
	var lookupClass = c;
	var lookupPatch = p;
	if (lookupPatch != '3.3')
		error = 'patchError';
	var classUrl;
	if (lookupClass == 'Duelist')
		classUrl = duelistUrl;
	else if (lookupClass == 'Marauder')
		classUrl = marauderUrl;
	else if (lookupClass == 'Templar')
		classUrl = templarUrl;
	else if (lookupClass == 'Scion')
		classUrl = scionUrl;
	else if (lookupClass == 'Shadow')
		classUrl = shadowUrl;
	else if (lookupClass == 'Ranger')
		classUrl = rangerUrl;
	else if (lookupClass == 'Witch')
		classUrl = witchUrl;
	else {
		error = 'classError';
	}
	if (error != '')
	{
		callback(error);
	}
	else
	{
		for(var i = 1; i <= pages; i++) {		
			request(classUrl + i.toString(), function(err, res, html)
			{
				if(!err)
				{	   				    
					var $ = cheerio.load(html);
					$('table tr td:nth-child(2) .title').each((index, value) => 
					{
						var title = $(value).text().trim();
						var forumlink = $(value).find('a').attr('href');
						if (title.indexOf(lookupPatch) > -1 && title.search(/help/i) == -1 && title.search(/list/i) == -1) 
						{
							findPoB(pathofexile+forumlink, function(result) 
							{
								var newBuild = 
								{
									name: title,
									class: lookupClass,
									patch: lookupPatch,
									forumlink: pathofexile+forumlink,
									pathofbuilding: result
								}
								db.builds.update({name: title}, newBuild, {upsert: true}, function(err, result)
								{
									if(err)
									{
										console.log(err);
										if (counter == (29 * pages) + (pages - 1))
										{
											callback(new Date(Date.now()).toString()); 
										}
										else {counter++; console.log("Call "+counter+"/"+(30 * pages)+" completed!");}
									}
									else
									{
										if (counter == (29 * pages) + (pages - 1))
										{
											callback(new Date(Date.now()).toString()); 
										}
										else {counter++; console.log("Call "+counter+"/"+(30 * pages)+" completed!");}
									}
								});
							});																		
						}
						else {counter++; console.log("Call "+counter+"/"+(30 * pages)+" completed!");};	 					 			
					});							
				}
				else 
				{
					counter++; 
					console.log("Call "+counter+"/"+(30 * pages)+" completed!");
					console.log(err);
				}			
			});		 
		}
	}	
}	

function findPoB(link, callback)
{
	request(link, function(err, res, html)
	{
		if (!err) {
			var pob_links_found = [];
			var linksArray = [];
			var $ = cheerio.load(html);
			var text = $('table tr:nth-child(1) .content-container').text();
			var links = $('a');
			$(links).each(function(index, link) {
				var uniquelink = true;
				for(var i = 0; i < linksArray.length; i++)
				{
					if ($(link).attr('href') == linksArray[i])
					{
						uniquelink = false;
					}
				}
				if (uniquelink == true)
				{
					linksArray.push($(link).attr('href'));
				}
			});
			for (var i = 0; i < linksArray.length; i++)
			{
				var value = linksArray[i];
				if (value != undefined && value.substring(0, 21) == 'https://pastebin.com/')
				{				
					pob_links_found.push(value);
				}
			}
			for (var pbIndex = text.indexOf('https://pastebin.com/'); pbIndex !== -1; pbIndex = text.indexOf('https://pastebin.com/', pbIndex + 1))
			{
				var pblink = text.substring(pbIndex, pbIndex + 29);
				var uniquetext = true;
				for (var i = 0; i < pob_links_found.length; i++)
				{
					if (pblink == pob_links_found[i])
					{
						uniquetext = false;
					}
				}
				if (uniquetext == true)
				{
					pob_links_found.push(pblink);
				}	
			}
			
			if (pob_links_found[0] != undefined)
				parsePoB(pob_links_found, function(result){
					callback(result);
				});
			else {
				callback(pob_links_found);
			}
		}
		else {
			callback(err);
		}
	});
}

function parsePoB(links, callback)
{
	var pobs_json = {};
	var pob_obj_array = [];
	var pob_obj = {};
	var raw_links = [];

	var resultsArray = [];

	for (var i = 0; i < links.length; i++)
	{
		raw_links.push(links[i].substring(0,21) + 'raw/' + links[i].substring(21,29));
	}

	decodePoB(raw_links, function(result) {
		for (var i = 0; i < result.length; i++)
		{
			var parsed_obj = {}
			parsed_obj.link = result[i].link;
			parseString(result[i].xml,  function(err, result){
				parsed_obj.parsed_pob_obj = result;
				//console.log(parsed_obj.parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat); //Used with testing page to figure out how PoB's are structured...
				resultsArray.push(parsed_obj);
			});
		}
		for (var h = 0; h < resultsArray.length; h++)
		{
			for (var i = 0; i < resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat.length; i++)
			{	
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'ActiveMinionLimit')
					var ActiveMinionLimit = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'AverageDamage')
					var AverageDamage = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'TotalDot')
					var TotalDot = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'IgniteDPS')
					var IgniteDPS = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'WithPoisonDPS')
					var WithPoisonDPS = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'CritMultiplier')
					var CritMultiplier = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'CritChance')
					var CritChance = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'MeleeEvadeChance')
					var MeleeEvadeChance = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'EnergyShield')
					var EnergyShield = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'DecayDPS')
					var DecayDPS = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'BleedDPS')
					var BleedDPS = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'PhysicalDamageReduction')
					var PhysicalDamageReduction = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'BlockChance')
					var BlockChance = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'SpellBlockChance')
					var SpellBlockChance = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'AttackDodgeChance')
					var AttackDodgeChance = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'SpellDodgeChance')
					var SpellDodgeChance = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'Life')
					var Life = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'LifeUnreserved')
					var LifeUnreserved = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'Mana')
					var Mana = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
				if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.stat == 'ManaUnreserved')
					var ManaUnreserved = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].PlayerStat[i].$.value;
			}
			var Level = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].$.level;
			var Ascendancy = resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].$.ascendClassName;
			var finalLink = resultsArray[h].link.substring(0, 21) + resultsArray[h].link.substring(25, 33);
			var finalLife = 0;
			if (parseInt(Life) < parseInt(EnergyShield))
			{
				finalLife = LifeUnreserved
			}
			else {
				finalLife = Life;
			}

			var config_obj = 
			{
				'config' : 
				{

				}
			};
			if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input != undefined)
			{
				for(var i = 0; i < resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input.length; i++)
				{
					var name = resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i];
					if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.name == 'enemyIsBoss')
					{
						config_obj.config[resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.name] = resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.string;
					}
					else if (resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.name == 'projectileDistance' || resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.name.substring(0, 12) == 'playerCursed')
					{
						config_obj.config[resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.name] = resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.number;
					}
					else
					{
						config_obj.config[resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.name] = resultsArray[h].parsed_pob_obj.PathOfBuilding.Config[0].Input[i].$.boolean;
					}			
				}
			}

			var TotalDPS = 0;

			if (WithPoisonDPS != undefined && WithPoisonDPS != '')
			{
				TotalDPS += parseInt(WithPoisonDPS)
			}
			if (IgniteDPS != undefined && IgniteDPS != '')
			{
				TotalDPS += parseInt(IgniteDPS)
			}
			if (TotalDot != undefined && TotalDot != '')
			{
				TotalDPS += parseInt(TotalDot)
			}
			if (BleedDPS != undefined && BleedDPS != '')
			{
				TotalDPS += parseInt(BleedDPS)
			}
			if (AverageDamage != undefined && AverageDamage != '' && AverageDamage > TotalDPS) // avg hit + dots is the TotalDPS
			{
				TotalDPS += parseInt(AverageDamage)*10
				if (WithPoisonDPS != undefined && WithPoisonDPS != '')
				{
					TotalDPS -= parseInt(WithPoisonDPS)
				}
			}
			if (TotalDPS == 0) { // Summoner
				if (ActiveMinionLimit != undefined && resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].MinionStat != undefined)
				TotalDPS = ActiveMinionLimit*parseInt(resultsArray[h].parsed_pob_obj.PathOfBuilding.Build[0].MinionStat[2].$.value);
			} 
			var pob_obj =
			{
				'link' : finalLink,
				'stats' : 
				{
					'Level' : Level,
					'Ascendancy' : Ascendancy,
					'Life' : finalLife,
					'EnergyShield' : EnergyShield,
					'Mana' : Mana,
					'ManaUnreserved' : ManaUnreserved,
					'MeleeEvadeChance' : MeleeEvadeChance,
					'AttackDodgeChance' : AttackDodgeChance,
					'SpellDodgeChance' : SpellDodgeChance,
					'BlockChance' : BlockChance,
					'SpellBlockChance' : SpellBlockChance,
					'PhysicalDamageReduction' : PhysicalDamageReduction,
					'TotalDPS' : TotalDPS,
					'CritChance' : CritChance,
					'CritMultiplier' : CritMultiplier
				},
				'config' :
				{

				}
			};
			pob_obj.config = Object.assign(pob_obj.config, config_obj.config);
			pob_obj_array.push(pob_obj);
			pobs_json.pob_objs = pob_obj_array;
		}
		callback(pobs_json);
	});
}

function decodePoB(links, callback)
{
	var result = [];
	var counter = 0;
	for (var i = 0; i < links.length; i++)
	{
		request(links[i], function(err, res, html) 
		{
			if(!err)
			{
				var $ = cheerio.load(html);
				var raw_data = $('body').text();

				raw_data = raw_data.replace('-','+').replace('_', '/');			
				var decoded_data = Buffer.from(raw_data, 'base64');

				zlib.unzip(decoded_data, (err, buffer) => {
					if (!err)
					{
						if (buffer == undefined) // not a pob, but is a pastebin link, ignore.
							counter++;
						else {
							counter++;
							var result_obj = {};
							result_obj.link = res.request.uri.href;
							result_obj.xml = buffer.toString();
							result.push(result_obj);

							if (counter == links.length)
							{	
								callback(result);
							}
						}
					}
					else {
						counter++;
					}
				});
			}
			else
			{
				callback(err);
			}	
		});
	}
}

app.listen('3002', function()
{
	console.log('Listening on port 3002...');
});
exports = module.exports = app;