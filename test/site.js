var express = require('express');
var url = require('url');
var http = require('http');
var https = require('https');
var jsonaryBundle = require('../node-package/jsonary-bundle');

var app = express();
app.use(express.bodyParser());

var jsonaryJsBundle;
function createBundles() {
	var bundle = jsonaryBundle.fresh();
	bundle.add('renderers/site');
	// extra plugins and renderers
	bundle.add('../plugins/jsonary.location');
	bundle.add('../plugins/jsonary.undo');
	bundle.add('../plugins/jsonary.jstl');
	bundle.add('../plugins/jsonary.render.table');
	bundle.add('../plugins/jsonary.render.generate');
	bundle.add('../renderers/string-formats');
	bundle.add('../renderers/contributed/full-preview');
	bundle.add('../renderers/contributed/full-instances');
	bundle.add('../renderers/contributed/adaptive-table');
	bundle.add('../renderers/contributed/markdown');
	
	bundle.writeCss('bundle.css');
	//bundle.writeCss('bundle.min.css', true);
	bundle.writeJs('bundle.js');
	//masterBundle.writeJs('bundle.min.js', true);
	return bundle;
}
var jsonaryJsBundle = createBundles();

var createJsonary = function () {
	var Jsonary = jsonaryJsBundle.instance();
	Jsonary.baseUri = 'http://localhost:8080/';
	var buttons = [];
	Jsonary.render.clearButtons = function () {
		buttons = [];
	};
	Jsonary.render.actionInputName = function (args) {
		var inputName = new Buffer(JSON.stringify({
			contextPath: args.context.labelSequence(),
			action: args.actionName,
			params: args.params
		})).toString('base64');
		return "Jsonary.input:" + inputName;
	};
	Jsonary.render.actionUrl = function (args) {
		return 'javascript:void(0)';
	};
	Jsonary.render.actionHtml = function (elementId, innerHtml, args) {
		var textValue = innerHtml.replace(/<.*?>/g, "");
		var inputName = new Buffer(JSON.stringify({
			contextPath: args.context.labelSequence(),
			action: args.actionName,
			params: args.params
		})).toString('base64');
		// Yes, I know that the browser also does percent-encoding.
		// However, if we simply escape the HTML, then any lists [] get interpreted as 
		var result = '<input type="submit" id="button-' + elementId + '" name="Jsonary.action:' + inputName + '" value="' + Jsonary.escapeHtml(textValue) + '"></input>';
		buttons.push({
			elementId: elementId,
			linkUrl: args.linkUrl,
			innerHtml: innerHtml
		});
		return result;
	};
	
	Jsonary.render.footerHtml = function () {
		result = "";
		result += '<script>';
		result += '(function (buttons) {';
		result += 	'var replaceButton = function (elementId, linkUrl, innerHtml) {';
		result += 		'var button = document.getElementById("button-" + elementId);'
		result += 		'button.style.display="none";';
		result += 		'var link = document.createElement("a");';
		result += 		'link.setAttribute("href", linkUrl);';
		result += 		'link.innerHTML = innerHtml;';
		result += 		'link.className = "jsonary-action";';
		result += 		'link.onclick = function () {';
		result += 			'document.getElementById("button-" + elementId).click();';
		result += 			'return false;';
		result += 		'};';
		result += 		'button.parentNode.insertBefore(link, button);';
		result += 	'};';
		result += 	'for (var i = 0; i < buttons.length; i++) {';
		result += 		'replaceButton(buttons[i].elementId, buttons[i].linkUrl, buttons[i].innerHtml);';
		result += 	'}';
		result += '})(' + JSON.stringify(buttons) + ');';
		result += '</script>';
		return result;
	};
	Jsonary.location.queryVariant = 'dotted';
	return Jsonary;
};

function LogTimer(timerName) {
	if (!(this instanceof LogTimer)) {
		return new LogTimer(timerName);
	}
	var firstTime = Date.now();
	var lastTime = firstTime;
	this.reset = function () {
		firstTime = lastTime = Date.now();
	};
	this.event = function (eventName) {
		var newTime = Date.now();
		console.log(timerName + ": " + eventName + ": " + (newTime - lastTime) + "ms");
		lastTime = newTime;
	};
	this.done = function () {
		var newTime = Date.now();
		console.log(timerName + ": " + (newTime - firstTime) + "ms total");
		lastTime = newTime;
	};
	console.log(timerName + ": started timer");
}
LogTimer.prototype = {
};

var defaultJsonPage = '/json/';
app.all('/', function (request, response) {
	function urlForUiState(uiState) {
		return '?' + Jsonary.encodeData(uiState, 'application/x-www-form-urlencoded', Jsonary.location.queryVariant);
	}

	var timer = LogTimer('request');
	// Reset bundles on every request
	//*/
	createBundles();
	timer.event('bundle Jsonary (ignoring)');
	timer.reset();
	//*/
	
	response.setHeader('Content-Type', 'text/html');
	var Jsonary = createJsonary();
	timer.event('create Jsonary');

	var renderContext;
	response.write('<pre><code>' + Jsonary.escapeHtml(JSON.stringify(request.body, null, 4)) + '</code></pre>');
	var savedData = {};
	if (request.body['Jsonary.data']) {
		try {
			savedData = JSON.parse(request.body['Jsonary.data']);
		} catch (e) {
			console.log("malformed Jsonary.data: " + request.body['Jsonary.data']);
		}
	}
	Jsonary.render.loadData = function (saveDataId) {
		var documentId = saveDataId.split(":")[0];
		var dataPath = saveDataId.substring(documentId.length + 1);
		if (savedData["doc" + documentId] !== undefined) {
			var doc = Jsonary.inflate(savedData["doc" + documentId]);
			return doc.root.subPath(dataPath);
		}
	}
	Jsonary.render.saveData = function (data, saveDataId) {
		var documentId = data.document.uniqueId;
		if (savedData["doc" + documentId] === undefined) {
			savedData["doc" + documentId] = data.document.deflate();
		}
		return documentId + ":" + data.pointerPath();
	};
	timer.event('extract stored data');

	var strippedUrl = request.url.replace(/&?Jsonary\.action=[^&]+/, "");
	var uiState = Jsonary.decodeData(url.parse(strippedUrl).query || '', 'application/x-www-form-urlencoded', Jsonary.location.queryVariant);
	canonicalUrl = urlForUiState(uiState);
	Jsonary.render.actionUrl = function (args) {
		var inputName = new Buffer(JSON.stringify({
			contextPath: args.context.labelSequence(),
			action: args.actionName,
			params: args.params
		})).toString('base64');
		var parts = canonicalUrl.split('#');
		if (parts[0].indexOf('?') == -1) {
			parts[0] += '?';
		} else {
			parts[0] += '&';
		}
		parts[0] += 'Jsonary.action=' + inputName;
		return parts.join('#');
	};
	
	Jsonary.asyncRenderHtml(defaultJsonPage, uiState, function (error, innerHtml, renderContext) {
		timer.event('first render');
		var needsReRender = false;
		// Execute inputs first, then actions
		for (var key in request.body) {
			if (key.substring(0, "Jsonary.input:".length) == "Jsonary.input:") {
				needsReRender = true;
				var base64 = key.substring("Jsonary.input:".length);
				try {
					var actionJson = new Buffer(base64, 'base64').toString();
					var actionArgs = JSON.parse(actionJson);
				} catch (e) {
					console.log("malformed Jsonary.input:" + base64);
					continue;
				}
				var actionContext = renderContext.labelSequenceContext(actionArgs.contextPath);
				if (actionContext) {
					var result = actionContext.actionArgs(actionArgs.action, [request.body[key]].concat(actionArgs.params));
				} else {
					console.log("Could not find input action context for: " + actionArgs.contextPath);
				}
			}
		}
		for (var key in request.body) {
			if (key.substring(0, "Jsonary.action:".length) == "Jsonary.action:") {
				needsReRender = true;
				var base64 = key.substring("Jsonary.action:".length);
				try {
					var actionJson = new Buffer(base64, 'base64').toString();
					var actionArgs = JSON.parse(actionJson);
				} catch (e) {
					console.log("malformed Jsonary.action:" + base64);
					continue;
				}
				var actionContext = renderContext.labelSequenceContext(actionArgs.contextPath);
				if (actionContext) {
					var result = actionContext.actionArgs(actionArgs.action, actionArgs.params);
				} else {
					console.log("Could not find action context for: " + actionArgs.contextPath);
				}
			}
		}
		for (var key in request.query) {
			if (key == 'Jsonary.action') {
				var base64 = request.query['Jsonary.action'];
				try {
					var actionJson = new Buffer(base64, 'base64').toString();
					var actionArgs = JSON.parse(actionJson);
				} catch (e) {
					console.log("malformed Jsonary.action:" + base64);
					continue;
				}
				var actionContext = renderContext.labelSequenceContext(actionArgs.contextPath);
				if (actionContext) {
					var result = actionContext.actionArgs(actionArgs.action, actionArgs.params);
				} else {
					console.log("Could not find action context for: " + actionArgs.contextPath);
				}
			}
		}
		timer.event('inputs/actions');
		
		if (needsReRender) {
			var uiState = renderContext.saveUiState();
			// TODO: replace link URLs *after* rendering, because rendering can actually change the uiState
			canonicalUrl = urlForUiState(uiState);
			Jsonary.whenRequestsComplete(function () {
				timer.event('requests complete, starting re-render');
				Jsonary.render.clearButtons();
				renderContext.asyncRerenderHtml(handleInnerHtml);
			});
		} else {
			handleInnerHtml(error, innerHtml, renderContext);
		}
	});
	
	function handleInnerHtml(error, innerHtml, renderContext) {
		timer.event('render complete');

		savedData = {};
		console.log(renderContext.saveUiState());

		var html = '';
		
		html += '<script src="https://cdnjs.cloudflare.com/ajax/libs/pagedown/1.0/Markdown.Converter.min.js"></script>';
		html += '<script src="https://cdnjs.cloudflare.com/ajax/libs/pagedown/1.0/Markdown.Sanitizer.min.js"></script>';
		html += '<link rel="stylesheet" href="bundle.css">';
		var savedUiState = renderContext.saveUiState();
		html += '<form action="' + urlForUiState(savedUiState) + '" method="POST">';
		html += innerHtml;
		html += Jsonary.render.footerHtml();
		html += '<input type="hidden" name="Jsonary.data" value=\'' + Jsonary.escapeHtml(JSON.stringify(savedData), true) + '\'>';
		html += '</form>';
		timer.event('saved state');
		
		//*/
		html += '<hr><div id="jsonary-target"></div>';
		html += '<script src="bundle.js"></script>';
		html += '<script>';
		html += 	'Jsonary.location.queryVariant = ' + JSON.stringify(Jsonary.location.queryVariant) + ';';
		html += 	'Jsonary.location.replace(' + JSON.stringify(urlForUiState(savedUiState)) + ');'
		html += 	'var renderContext;';
		html += 	'var changeMonitor = Jsonary.location.onChange(function () {';
		html += 		'renderContext = Jsonary.render("jsonary-target", ' + JSON.stringify(defaultJsonPage) + ', Jsonary.location.query.value());';
		html += 	'});';
		html += 	'Jsonary.render.addActionHandler(function (context, data, actionName, historyPoint) {';
		html += 		'if (historyPoint) {';
		html += 			'Jsonary.location.addHistoryPoint();';
		html += 		'}';
		html += 		'changeMonitor.ignore(function () {';
		html += 			'Jsonary.location.query.setValue(renderContext.saveState());';
		html += 		'});';
		html += 	'});';
		html += '</script>';
		//*/
		
		html += '<hr><pre>';
		html += JSON.stringify(savedData, null, '\t');
		html += '</pre>';
		response.end(html);
		timer.done();
	}
});

function prettyJson(data) {
	var json = JSON.stringify(data, null, "\t");
	function compactJson(json) {
		try {
			var compact = JSON.stringify(JSON.parse(json));
			var parts = compact.split('"');
			for (var i = 0; i < parts.length; i++) {
				var part = parts[i];
				part = part.replace(/:/g, ': ');
				part = part.replace(/,/g, ', ');
				parts[i] = part;
				i++;
				while (i < parts.length && parts[i].charAt(parts[i].length - 1) == "\\") {
					i++;
				}
			}
			return parts.join('"');
		} catch (e) {
			return json;
		}
	}
	
	json = json.replace(/\{[^\{,}]*\}/g, compactJson); // Objects with a single simple property
	json = json.replace(/\[[^\[,\]]*\]/g, compactJson); // Arrays with a single simple item
	json = json.replace(/\[[^\{\[\}\]]*\]/g, compactJson); // Arrays containing only scalar items
	return json;
}
app.use('/json/schemas/', function (request, response, next) {
	response.set('Content-Type', 'application/json');
	response.links({
		describedby: "http://json-schema.org/hyper-schema"
	});
	next();
});
app.use('/json/schemas/', express.static(__dirname + '/json/schemas'));

app.get('/json/', function (request, response, next) {
	response.set('Content-Type', 'application/json');
	response.links({
		describedby: "schemas/site"
	});
	response.json({
		"title": "Jsonary",
		"topContent": "[download](https://github.com/geraintluff/jsonary/raw/master/get-started-bundle.zip) and get started",
		"sections": [
			{
				"title": "Features and goals",
				"tabs": "pages/features-and-goals"
			},
			{
				"title": "Examples",
				"tabs": "pages/examples"
			},
			{
				"title": "API",
				"tabs": "api/"
			}
		]
	});
});

app.use('/json/', function (request, response) {
	response.setHeader('Content-Type', 'application/json');
	var path = request.url.split('?')[0];
	if (path == "/data") {
		if (request.method == 'PUT') {
			exampleData = request.body;
		}
		response.setHeader('Content-Type', 'application/json; profile=schema');
		response.send(prettyJson(exampleData, null, "\t"));
	} else if (path == "/schema") {
		response.setHeader('Content-Type', 'application/json; profile=schema');
		response.send(prettyJson({
			title: "Example JSON Schema",
			links: [
				{
					href: "",
					rel: "edit"
				}
			],
			type: "object",
			properties: {
				"title": {type: "string"},
				"boolean": {type: "boolean"},
				"array": {
					type: "array",
					items: {
						type: "object",
						properties: {
							"a": {type: "integer", minimum: 0},
							"b": {type: "integer"}
						}
					}
				},
				"enum": {"enum": ["one", "two", "three", "orange"]}
			},
			required: ["title", "array"]
		}, null, "\t"));
	} else {
		response.statusCode = 404;
		response.send(JSON.stringify({
			statusCode: 404,
			statusText: "Not Found",
			message: "Resource not found: " + request.url,
			data: {url: request.url}
		}, null, "\t"));
	}
});

app.use('/', express.static(__dirname));

var SERVER_PORT = 8080;
http.createServer(app).listen(SERVER_PORT);
console.log('Listening on port 8080');