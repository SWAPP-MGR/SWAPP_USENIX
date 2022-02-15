var cacheGuard = new Object();

cacheGuard.appname = "CACHEGUARD";

cacheGuard.loaded = false;

cacheGuard.dummyElement = {};
cacheGuard.loadTime = {};
cacheGuard.max_wait = 5000;
cacheGuard.max_lastreqdelay = 30000;

cacheGuard.session = {};
cacheGuard.session.allowedReferer = [self.location.hostname];
cacheGuard.session.u = {};
cacheGuard.session.k = {};
cacheGuard.session.profile = {};

cacheGuard.resetProfile = function() { cacheGuard.session.profile = {};}

cacheGuard.msgLabel = ["cacheguard"];
cacheGuard.msgHandler = function(label, msg) {
  if(msg == "reset") cacheGuard.resetProfile();
}

cacheGuard.load = async function() {
  cacheGuard.session = await swappInst.storage.get("cacheGuard") || undefined;

  if(!cacheGuard.session)
  {
    cacheGuard.session = {};
    cacheGuard.session.allowedReferer = [self.location.hostname];
    cacheGuard.session.u = {};
    cacheGuard.session.k = {};
    cacheGuard.session.profile = {};
  }

  cacheGuard.dummyElement = {};
  cacheGuard.loadTime = {};
  cacheGuard.max_wait = 5000;
  cacheGuard.max_lastreqdelay = 30000;

  cacheGuard.loaded = true;
}

cacheGuard.save = function() {
  swappInst.storage.set("cacheGuard", cacheGuard.session);
}

cacheGuard.onswactivate = async function() {
  await cacheGuard.load();
}

cacheGuard.setAllowedReferer = function(lst) {
  cacheGuard.session.allowedReferer = cacheGuard.session.allowedReferer.concat(lst);
  cacheGuard.save();
}

cacheGuard.sleep = async function(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

cacheGuard.reqMatch = async function(fObj)
{
  let url = new URL(fObj.getMetadata().url);

  if(!cacheGuard.loaded)
  {
    await cacheGuard.load();
  }

	//Start counting the load time
	cacheGuard.loadTime[url.href] = performance.now();

  if(!cacheGuard.session.u[origin])
  {
    cacheGuard.session.u[origin] = 0;
  }

  if(!cacheGuard.session.k[origin])
  {
    cacheGuard.session.k[origin] = 0;
  }

  if(fObj.getDecision() == "cache")
  {
	  return true;
  }

  let path = url.pathname
	if(cacheGuard.dummyElement[path])
	{
		return true;
	}
  
  return false;
}

cacheGuard.reqAction = async function(fObj)
{
  let url = new URL(fObj.getMetadata().url);
  let origin = url.origin;


  // Heuristic: Delay the cache response to make it look like the request is done over the network
  let path = url.pathname
	if(cacheGuard.dummyElement[path])
	{
		await new Promise(resolve => setTimeout(resolve, cacheGuard.session.u[origin]));
    fObj.setBody("");
    fObj.setDecision("cache");
	}

	// Heuristic: Block all 3rd party referrer
	let r = fObj.getMetadata().referrer;

	if(r)
	{
		let referer = (new URL(r)).host;

		if(cacheGuard.session.allowedReferer.indexOf(referer) < 0)
		{
			fObj.setDecision("drop");
		}
	}

	return fObj;
}

cacheGuard.respMatch = async function(fObj)
{
	let id = fObj.getMetadata().url;
  let delay = false;
  let needdummy = false;

  let url = new URL(fObj.getMetadata().url);
  let path = url.pathname;
  let origin = url.origin;

  if(cacheGuard.dummyElement[path])
  {
    delete cacheGuard.dummyElement[path];
    return false;
  }

	if(cacheGuard.loadTime.hasOwnProperty(id))
	{
		let currLoad = performance.now() - cacheGuard.loadTime[id];
		delete cacheGuard.loadTime[id];

    if(fObj.getDecision() != "cache")
    {
		  //Update the average
		  cacheGuard.session.k[origin] = cacheGuard.session.k[origin] + 1;
      cacheGuard.session.u[origin] = cacheGuard.session.u[origin] + (currLoad - cacheGuard.session.u[origin])/cacheGuard.session.k[origin];
      cacheGuard.save();
    }

		//Clean up
		if(cacheGuard.loadTime.length > 20)
		{
			cacheGuard.loadTime = {};
		}

		if(cacheGuard.session.u[origin] > cacheGuard.max_wait || cacheGuard.session.k[origin] > 150 || cacheGuard.session.u[origin] < 0)
		{
			cacheGuard.session.u[origin] = 0;
			cacheGuard.session.k[origin] = 0;
			cacheGuard.loadTime = {};
      cacheGuard.save();
		}
	}

  //Check if the request is for a document or originated from a document
  if(swappInst.isWebpage(fObj.getMetadata().headers.get("Content-Type")))
  {
    cacheGuard.lastDocumentRequest = {url: fObj.getMetadata().url, time: performance.now()}

    //Will inject a dummy element to delay the load time
    needdummy = true;
  }
  else
  {
    //Otherwise, check if the request has a prior document request who originates it
    if(cacheGuard.lastDocumentRequest && performance.now() - cacheGuard.lastDocumentRequest.time < cacheGuard.max_lastreqdelay)
    {
      //Last Doc valid, check further
      p = cacheGuard.session.profile[cacheGuard.lastDocumentRequest.url];
      if(p && p.includes(fObj.getMetadata().url))
      {
        //Valid load entry, Allow cache normally
      }
      else
      {
        //Invalid load entry
        delay = true;

        if(!p)
        {
          cacheGuard.session.profile[cacheGuard.lastDocumentRequest.url] = [];
        }

        cacheGuard.session.profile[cacheGuard.lastDocumentRequest.url].push(fObj.getMetadata().url);
        cacheGuard.save();
      }
    } 
    else
    {
      // Last Doc invalid
      delay = true;
    }
  }

  if(delay)
  {
    // Heuristic: Delay the cache response to make it look like the request is done over the network
	  if(fObj.getDecision() == "cache")
	  {
      console.log("Delaying", cacheGuard.session.u[origin]);
      let s = performance.now();
		  await new Promise(resolve => setTimeout(resolve, cacheGuard.session.u[origin]));
	  }
  }
  
	return needdummy;
}

cacheGuard.genrandomid = function() {
  length = 10;
  var result           = [];
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) 
  {
      result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
  }

  return "/" + result.join('');
}

cacheGuard.respAction = function(fObj)
{
  //Inject dummy element
  let randomelem = cacheGuard.genrandomid();
  fObj.setBody(swappInst.writeAfterMatch(fObj.getBody(), "\n\t<script src=\"" + randomelem + "\" async></script>", "<head>"));
  cacheGuard.dummyElement[randomelem] = performance.now();

  return fObj;
}

cacheGuard.tcbMatch = true;
cacheGuard.tcbAction = `
document.addEventListener("resetCacheGuard", () => {
  sendMsg(["cacheguard"], "reset");
});
`;

console.log("[C]ache[G]uard activated");
swappInst.addApp(cacheGuard);


