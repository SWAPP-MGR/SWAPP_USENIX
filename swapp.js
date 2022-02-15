/*
The primitive object that will be passed around the framework.
Contain the metadata (i.e., HTTP headers) and content (HTTP body).
The decision can be set so that the framework can reject a request/response.
The execution and priority orders are specified later when adding apps using eOrder/pLevel.
*/
function fProto(initdecision)
{
    let decision = initdecision || "dirty";
    let metadata = {};
    let body = "";
    let headers = {};
    let curr_pLevel = 0;
    let orig_metadata = {};
    let orig_body = "";
    let orig_headers = {};

    this.setDecision = function(givenDecision, pLevel){
        if(!pLevel)
        {
          pLevel = curr_pLevel+1;
        }
        if(curr_pLevel < pLevel)
        {
          decision = givenDecision;
          curr_pLevel = pLevel;
        }
    };

		this.updateMeta = function(update){
			if(metadata.constructor === Request)
			{
				let mObj = {
					cache: update.cache || metadata.cache,
					context: update.context || metadata.context,
					credentials: update.credentials || metadata.credentials,
					destination: update.destination || metadata.destination,
					headers: update.headers || metadata.headers,
					integrity: update.integrity || metadata.integrity,
					method: update.method || metadata.method,
					//mode: update.mode || metadata.mode,
					redirect: update.redirect || metadata.redirect,
					referrer: update.referrer || metadata.referrer,
					referrerPolicy: update.referrerPolicy || metadata.referrerPolicy,
					body: update.body || metadata.body,
					bodyUsed: update.bodyUsed  || metadata.bodyUsed
				};

				metadata = new Request(update.url || metadata.url, mObj);
			}
			else if(metadata.constructor === Response)
			{
				console.log("Response metadata not allowed to be modified");
			}
			else
			{
				console.log("Error metadata type detected");
			}
		};

    this.setMeta = function(givenMetadata){
        if(Object.keys(metadata).length == 0)
        {
          orig_metadata = givenMetadata;
        }

        metadata = givenMetadata;
    };

    this.setBody = function(givenBody){
        if(body == "")
        {
          orig_body = givenBody;
        }

        body = givenBody;
    };

    this.setHeaders = function(givenHeaders){
        if(Object.keys(headers).length == 0)
        {
          orig_headers = givenHeaders;
        }

        headers = givenHeaders;
    }

    this.getDecision = function(){return decision;};
    this.getMetadata = function(){return metadata;};
    this.getOrigMetadata = function(){return orig_metadata;};
    this.getHeaders = function(){return headers;};
    this.getBody = function(){return body;};
    this.getOrigBody = function(){return orig_body;};
}

//
// The main SWAPP framework object. 
//
function swapp()
{
    let apps = []; // List of registered normal apps

    let reqOrder = [];	// List of the execution order of request handlers
    let respOrder = [];	// List of the execution order of response handlers
    let tcbOrder = [];	// List of the execution order of tcb handlers

    let secret = makeid(128); // Randomized secret code for postMessage
    let msgChannel = [];  // List of dedicated message channels established

		let totalAppTime = 0; // For evaluation
    let currentFetchID = 0; // For evaluation

    // Internal state variables
    this.storage= new Storage();

    // Generate secret code
    function makeid(length) 
    {
        var result           = [];
        var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for ( var i = 0; i < length; i++ ) 
        {
            result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
        }

        return result.join('');
    }

    // Helper function
    function intersect(a, b) {
        var setB = new Set(b);
        return [...new Set(a)].filter(x => setB.has(x));
    }

    // Reorder the app execution order upon adding new apps
    function reorder(arr, app, mProp, eOrder)
    {
        if(app.hasOwnProperty(mProp))
        {
            if(app.hasOwnProperty(eOrder))
            {
                let o = new Object();

                o.pos = apps.length - 1;
                o.orderLevel = app[eOrder];

                if(arr.length == 0)
                {
                    arr.push(o);
                }
                else
                {
                    for(let i = 0; i<arr.length; i++)
                    {
                        if(arr[i].orderLevel > o.orderLevel)
                        {
                            arr.splice(i, 0, o);
                            break;
                        }
                        else
                        {
                            if(i == arr.length-1)
                            {
                                arr.push(o);
                                break;
                            }
                        }
                    }
                }
            }
            else
            {
                let o = new Object();

                o.pos = apps.length - 1;

                if(arr.length == 0)
                {
                    o.orderLevel = 50;
                }
                else
                {
                    o.orderLevel = arr[arr.length-1].orderLevel + 1;
                }

                arr.push(o);
            }
        }
    }

    // External API for adding new SWAPP apps
    this.addApp = function(app)
    {
        if(!app.appname)
        {
          app.appname = "App" + apps.length.toString();
        }

        apps.push(app);

        reorder(reqOrder, app, "reqMatch", "reqOrder");
        reorder(respOrder, app, "respMatch", "respOrder");
        reorder(tcbOrder, app, "tcbMatch", "tcbOrder");
    };

    // Internal function to check if a response is a web page. Used to check before injecting TCB.
    function isWebpage(contentType)
    {
        // This list is temporary. Will be improved upon release for more robust detection
        let list = ["application/x-httpd-php", "text/html"]; 

        for(let i=0; i<list.length; i++)
        {
            if(contentType.includes(list[i]))
            {
                return true;
            }
        }

        return false;
    }

    // External helper function to check if a response is a web page. 
    this.isWebpage = function(contentType)
    {
        // This list is temporary. Will be improved upon release for more robust detection
        let list = ["application/x-httpd-php", "text/html"]; 

        for(let i=0; i<list.length; i++)
        {
            if(contentType.includes(list[i]))
            {
                return true;
            }
        }

        return false;
    }

    // Internal function to check if a request is for the trusted code block script, so we can skip processing it.
    function isTCB(reqURL)
    {
        var re = /\/tcb\/[^\/]*.js/;
        if(re.test(reqURL))
        {
            return true;
        }

        return false;
    }

    // Internal helper function to insert text into the body
    writeAfterMatchInternal = function(targetString, appendingString, matchString)
    {
        let p = targetString.search(matchString);

        if(p>-1)
        {
            p = p + matchString.length;

            return targetString.substring(0, p) + appendingString + targetString.substring(p);
        }

        return targetString;
    }

    writeBeforeMatchInternal = function(targetString, appendingString, matchString)
    {
        let p = targetString.search(matchString);

        if(p>-1)
        {
            return targetString.substring(0, p) + appendingString + targetString.substring(p);
        }

        return targetString;
    }

    // External helper function to insert text into the body
    this.writeAfterMatch = function(targetString, appendingString, matchString)
    {
        return writeAfterMatchInternal(targetString, appendingString, matchString);
    };

    this.writeBeforeMatch = function(targetString, appendingString, matchString)
    {
        return writeBeforeMatchInternal(targetString, appendingString, matchString);
    };

    // Internal function to handle requests
    async function CEGRequest(req)
    {
        let appCount = reqOrder.length;
        let fObject = new fProto();

        fObject.setMeta(req);
        fObject.setHeaders(req.headers);

        appCount = reqOrder.length;
        
        for(let i=0; i<appCount; i++)
        {
            let app = apps[reqOrder[i].pos];

            if(app.hasOwnProperty("reqMatch"))
            {
								createLabel("StartofAppRequestHandler:" + parseInt(req.id) + ":" + app.appname + ":" + req.url);

                if(await app.reqMatch(fObject))
                {
                    fObject = await app.reqAction(fObject);
                }

                createLabel("EndofAppRequestHandler:" + parseInt(req.id) + ":" + app.appname + ":" + req.url);
            }
        }

        return fObject;
    }

    // Internal function to handle responses
    async function processResponse(resp, body, decision)
    {
        let appCount = tcbOrder.length;
        let fObject = new fProto(decision);

        fObject.setMeta(resp);
        fObject.setBody(body);

        if(isTCB(resp.url))
        {
            for(let i=0; i<appCount; i++)
            {
                let app = apps[tcbOrder[i].pos];

                if(app.hasOwnProperty("tcbMatch"))
                {
										createLabel("StartofAppTCBHandler:" + parseInt(resp.id) + ":" + app.appname + ":" + resp.url);

                    if(app.tcbMatch)
                    {
                        // Inject app code into the TCB
                        fObject.setBody(writeBeforeMatchInternal(fObject.getBody(), app.tcbAction, "//__EOF__"));
                    }

                    createLabel("EndofAppTCBHandler:" + parseInt(resp.id) + ":" + app.appname + ":" + resp.url);
                }
            }

            fObject.setBody(writeBeforeMatchInternal(fObject.getBody(), `var secret = "` + secret + `";`, "//__SECRET__"));

            return fObject;
        }
        // Normal requests
        else
        {

            appCount = respOrder.length;
            for(let i=0; i<appCount; i++)
            {
                let app = apps[respOrder[i].pos];

                if(app.hasOwnProperty("respMatch"))
                {
										createLabel("StartofAppResponseHandler:" + parseInt(resp.id) + ":" + app.appname + ":" + resp.url);

                    if(await app.respMatch(fObject))
                    {
												fObject = await app.respAction(fObject);
                    }

                    createLabel("EndofAppResponseHandler:" + parseInt(resp.id) + ":" + app.appname + ":" + resp.url);
                }
            }
						
            if(isWebpage(fObject.getMetadata().headers.get("Content-Type")))
            {
								
                fObject.setBody(initDocumentContext(fObject));
            }

            return fObject;
        }
    }

    // Internal function to inject the TCB into pages
    function initDocumentContext(fObject)
    {
      return writeAfterMatchInternal(fObject.getBody(), "\n\t<script src=\"./tcb/init.js\"></script>", "<head>");
    }

    // External function to handle requests
    this.fetchSupervisor = async function(req)
    {
      currentFetchID += 1;
      let localID = currentFetchID;
      req.id = localID;

      createLabel("StartRequestHandler:" + parseInt(localID) + ":" + req.url);
      // Preprocess the request
      let fObject = await CEGRequest(req);
      createLabel("EndRequestHandler:" + parseInt(localID) + ":" + req.url);
      // Proceed to fetch and modify the response accordingly

      if(fObject.getDecision() == "original" || fObject.getDecision() == "dirty")
      {
        createLabel("StartActualRequest:" + parseInt(localID) + ":" + req.url);

        let resp = await fetch(req);
        resp.id = localID;

        createLabel("EndActualRequestAndStartResponseHandler:" + parseInt(localID) + ":" + req.url);

        let ret = await CEGResponse(resp, "original");

        createLabel("EndResponseHandler:" + parseInt(localID) + ":" + req.url);

        getLabels();
        return ret;
      }
      else if(fObject.getDecision() == "dirty")
      {
        createLabel("StartActualRequest:" + parseInt(localID) + ":" + req.url);

        let meta = fObject.getMetadata();
        let resp = await fetch(new Request(meta));
        resp.id = localID;

        createLabel("EndActualRequestAndStartResponseHandler:" + parseInt(localID) + ":" + req.url);

        let ret = await CEGResponse(resp, "dirty");

        createLabel("EndResponseHandler:" + parseInt(localID) + ":" + req.url);

        getLabels();
        return ret;
      }
      else if(fObject.getDecision() == "cache")
      {
        createLabel("StartResponseHandler:" + parseInt(localID) + ":" + req.url);

        let r = new Response(fObject.getBody(), fObject.getMetadata());

				Object.defineProperty(r, "type", { value: fObject.getMetadata().type });
				Object.defineProperty(r, "url", { value: fObject.getMetadata().url });
				r.id = localID;

        let ret = await CEGResponse(r, "cache");

        createLabel("EndResponseHandler:" + parseInt(localID) + ":" + req.url);

        getLabels();
				return ret;
      }
      else if(fObject.getDecision() == "drop")
      {
        createLabel("EndResponseHandler:" + parseInt(localID) + ":" + req.url);

        getLabels();
        return null;
      }
      else{
        //return error
        createLabel("EndResponseHandler:" + parseInt(localID) + ":" + req.url);
      }
    }

    // Internal function to handle responses
    async function CEGResponse(resp, decision)
    { 
			// If the response is invalid to reconstruct, then return the original without processing.
			if(resp.type == "opaqueredirect" || resp.type == "error" || resp.type == "opaque")
			{
				return resp;
			}
			// Skip if it is a font
			let contentType = resp.headers.get("Content-Type");

			if((contentType && contentType.includes("font")) || resp.url.includes(".woff") || resp.url.includes(".eot") || resp.url.includes(".otf") || resp.url.includes(".ttf"))
			{
				return resp;
			}
			// Currently, we skip gif images and CSS, but may be useful to inspect gif image and CSS later
			if(contentType && (contentType.includes("gif")))
			{
				return resp;
			}

      if(contentType.includes("css"))
      {
        return resp;
      }
			
      let b = await resp.text();
      let fObject = await processResponse(resp, b, decision);
      
      if(fObject.getDecision() == "original")
      {
        var ret = new Response(fObject.getOrigBody(), fObject.getOrigMetadata());
      }
      else if(fObject.getDecision() == "dirty" || fObject.getDecision() == "cache")
      {
        var ret = new Response(fObject.getBody(), fObject.getMetadata());
      }
      else if(fObject.getDecision() == "drop")
      {
        // Return error page
        //ret = new Response(fObject.getBody(), fObject.getMetadata());
      }

			//ret = new Response(fObject.getBody(), fObject.getMetadata());
			
      return ret;
    }

    // External function to handle activate event
    this.activateSupervisor = function()
    {
      appCount = apps.length;
      for(let i=0; i<appCount; i++)
      {
        let app = apps[i];

        if(app.hasOwnProperty("onswactivate"))
        {
						app.onswactivate();
        }
      }
    }

    // External function to handle and dispatch postMessage
    this.messageManager = function(event)
    {
        let label = event.data.label;
        let msg = event.data.msg;
        let sender = event.ports[0];

        if(event.data.secret != secret)
        {
            console.log("[Error] Incorrect secret code");
            return;
        }

        if(intersect(label, ["SWAPP_INIT"]).length > 0)
        {
            msgChannel.push(sender);
            return;
        }

        for(let i=0; i<apps.length; i++)
        {
            let app = apps[i];

            if(app.hasOwnProperty("msgLabel"))
            {
                let matchedLabel = intersect(app.msgLabel, label);

                if(matchedLabel.length > 0)
                {
										//let b = performance.now();
                    app.msgHandler(matchedLabel, msg); 

                    // For evaluation
										//let a = performance.now();
										//totalAppTime += a-b;
										//console.log("totalAppTime: ", totalAppTime);
                }
            }
        }
    }

    // Broadcast to dedicated channels
    this.broadcastMsg = function(label, msg)
    {
        for(let i=0; i<msgChannel.length; i++)
        {
            msgChannel[i].postMessage({"label": label, "msg": msg, "secret": secret});
        }
    }
}

var swappInst= new swapp();

