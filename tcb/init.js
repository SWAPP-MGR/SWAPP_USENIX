/*
This file is injected into every web page to first establish the Trusted Code Block environment.
The list of functions that need to be frozen is not finished and will be updated as needed. 
(i.e., the console.log should be removed as well for release.)
*/

(function(){
  // Set up IDB
  // Utility functions (timing measurement) for evaluation only

  function EStorage() {
      this.ready = new Promise((resolve, reject) => {
          var request = indexedDB.open('SWAPP_EVALUATION');

          request.onupgradeneeded = e => {
              this.db = e.target.result;
              this.db.createObjectStore('store');
          };

          request.onsuccess = e => {
              this.db = e.target.result;
              resolve();
          };

          request.onerror = e => {
              this.db = e.target.result;
              reject(e);
          };
      });
  }

  EStorage.prototype.getAll = function() {
      var obj = this;
      return this.ready.then(() => {
          return new Promise((resolve, reject) => {
              var request = obj.getStore().getAll();
              request.onsuccess = e => resolve(e.target.result);
              request.onerror = reject;
          });
      });
  };

  EStorage.prototype.getStore = function() {
      return this.db
          .transaction(['store'], 'readwrite')
          .objectStore('store');
  };

  EStorage.prototype.set = function(key, value) {
      var obj = this;
      return this.ready.then(() => {
          return new Promise((resolve, reject) => {
              var request = obj.getStore().put(value, key);
              request.onsuccess = resolve;
              request.onerror = reject;
          });
      });
  };

  EStorage.prototype.delete = function(key, value) {
      indexedDB.deleteDatabase(location.origin);
  };

  let edb = new EStorage();

  function createLabel(label)
  {
    // Save a time-label to the dedicated storage

    let t = performance.now() + performance.timeOrigin;
    edb.set(t, {"time": t, "label": label});
  }

  async function getLabels()
  {
    let labels = await edb.getAll();
    let results = [];

    for(let i=0; i<labels.length; i++)
    {
      let arr = labels[i].label.split(":", 3);
      let g = parseInt(arr[1]);
      
      if(results[g])
      {
        results[g].push(labels[i]);

      }
      else
      {
        results[g] = [labels[i]];
      }
    }

    for(let i=0; i<results.length; i++)
    {
      if(results[i] && results[i].length > 0)
      {
        for(let j=results[i].length-1; j>0; j--)
        {
          results[i][j]["time"] = results[i][j]["time"] - results[i][j-1]["time"];
        }
      }
    }

    console.log(results);
  }

	// Disable Service Worker (un)registration APIs to prevent malicious script from removing SWAPP.

	var swRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
	var inst_swRegister = function(path, option)
		{
			console.log("Service worker registration disallowed");
			return undefined;
		};

	Object.defineProperty(navigator.serviceWorker, "register",
		{		
			value: inst_swRegister,
			configurable: false,
			writable: false
		});

  var swUnregister = ServiceWorkerRegistration.prototype.unregister.bind(ServiceWorkerRegistration.prototype);
	var inst_swUnregister = function()
		{
			console.log("Service worker unregistration disallowed");
			return undefined;
		};

  Object.defineProperty(ServiceWorkerRegistration.prototype, "unregister",
		{		
			value: inst_swUnregister,
			configurable: false,
			writable: false
		});


  // Freeze APIs used for verifying the integrity of native functions, checkIntegrity().

  Object.freeze(document.createElement);
  document.addEventListener("DOMContentLoaded", function(event) {
    Object.freeze(document.body.appendChild);
    Object.freeze(document.body.removeChild);
  });
  
  Object.freeze(HTMLElement.contentWindow);
 

	// Allocate an indexedDB entry for exclusive usage inside SWAPP. Internal usage utilizes idb_internal() instead.

	var idb_open = indexedDB.open.bind(indexedDB);

	var inst_idbopen = function(name, version){
		if(name != "SWAPP_DB" && name != "SW_DB")
		{
			return idb_open.apply(window, arguments);
		}
		else
		{
			return new Error("Access not allowed outside SWAPP.");
		}
	};

	Object.defineProperty(indexedDB, "open", {
		value: inst_idbopen,
		configurable: false,
		writable: false
	});

  var idb_internal = function(name, version) {
    if(name != "SW_DB")
    {
      return idb_open.apply(window, arguments);
    }
    else
    {
	    return new Error("Access not allowed outside SW.");
    }
  };
  
  // Some helper functions mostly for checkIntegrity().

	function intersect(a, b) {
		var setB = new Set(b);
		return [...new Set(a)].filter(x => setB.has(x));
	}

  //  A formatted version of a popular md5 implementation.
  //  Original copyright (c) Paul Johnston & Greg Holt.
  //  The function itself is now 42 lines long.
  //  Use for generating MD5 of a function definition

  function md5(inputString) {
      var hc="0123456789abcdef";
      function rh(n) {var j,s="";for(j=0;j<=3;j++) s+=hc.charAt((n>>(j*8+4))&0x0F)+hc.charAt((n>>(j*8))&0x0F);return s;}
      function ad(x,y) {var l=(x&0xFFFF)+(y&0xFFFF);var m=(x>>16)+(y>>16)+(l>>16);return (m<<16)|(l&0xFFFF);}
      function rl(n,c)            {return (n<<c)|(n>>>(32-c));}
      function cm(q,a,b,x,s,t)    {return ad(rl(ad(ad(a,q),ad(x,t)),s),b);}
      function ff(a,b,c,d,x,s,t)  {return cm((b&c)|((~b)&d),a,b,x,s,t);}
      function gg(a,b,c,d,x,s,t)  {return cm((b&d)|(c&(~d)),a,b,x,s,t);}
      function hh(a,b,c,d,x,s,t)  {return cm(b^c^d,a,b,x,s,t);}
      function ii(a,b,c,d,x,s,t)  {return cm(c^(b|(~d)),a,b,x,s,t);}
      function sb(x) {
          var i;var nblk=((x.length+8)>>6)+1;var blks=new Array(nblk*16);for(i=0;i<nblk*16;i++) blks[i]=0;
          for(i=0;i<x.length;i++) blks[i>>2]|=x.charCodeAt(i)<<((i%4)*8);
          blks[i>>2]|=0x80<<((i%4)*8);blks[nblk*16-2]=x.length*8;return blks;
      }
      var i,x=sb(inputString),a=1732584193,b=-271733879,c=-1732584194,d=271733878,olda,oldb,oldc,oldd;
      for(i=0;i<x.length;i+=16) {olda=a;oldb=b;oldc=c;oldd=d;
          a=ff(a,b,c,d,x[i+ 0], 7, -680876936);d=ff(d,a,b,c,x[i+ 1],12, -389564586);c=ff(c,d,a,b,x[i+ 2],17,  606105819);
          b=ff(b,c,d,a,x[i+ 3],22,-1044525330);a=ff(a,b,c,d,x[i+ 4], 7, -176418897);d=ff(d,a,b,c,x[i+ 5],12, 1200080426);
          c=ff(c,d,a,b,x[i+ 6],17,-1473231341);b=ff(b,c,d,a,x[i+ 7],22,  -45705983);a=ff(a,b,c,d,x[i+ 8], 7, 1770035416);
          d=ff(d,a,b,c,x[i+ 9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,     -42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
          a=ff(a,b,c,d,x[i+12], 7, 1804603682);d=ff(d,a,b,c,x[i+13],12,  -40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);
          b=ff(b,c,d,a,x[i+15],22, 1236535329);a=gg(a,b,c,d,x[i+ 1], 5, -165796510);d=gg(d,a,b,c,x[i+ 6], 9,-1069501632);
          c=gg(c,d,a,b,x[i+11],14,  643717713);b=gg(b,c,d,a,x[i+ 0],20, -373897302);a=gg(a,b,c,d,x[i+ 5], 5, -701558691);
          d=gg(d,a,b,c,x[i+10], 9,   38016083);c=gg(c,d,a,b,x[i+15],14, -660478335);b=gg(b,c,d,a,x[i+ 4],20, -405537848);
          a=gg(a,b,c,d,x[i+ 9], 5,  568446438);d=gg(d,a,b,c,x[i+14], 9,-1019803690);c=gg(c,d,a,b,x[i+ 3],14, -187363961);
          b=gg(b,c,d,a,x[i+ 8],20, 1163531501);a=gg(a,b,c,d,x[i+13], 5,-1444681467);d=gg(d,a,b,c,x[i+ 2], 9,  -51403784);
          c=gg(c,d,a,b,x[i+ 7],14, 1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);a=hh(a,b,c,d,x[i+ 5], 4,    -378558);
          d=hh(d,a,b,c,x[i+ 8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16, 1839030562);b=hh(b,c,d,a,x[i+14],23,  -35309556);
          a=hh(a,b,c,d,x[i+ 1], 4,-1530992060);d=hh(d,a,b,c,x[i+ 4],11, 1272893353);c=hh(c,d,a,b,x[i+ 7],16, -155497632);
          b=hh(b,c,d,a,x[i+10],23,-1094730640);a=hh(a,b,c,d,x[i+13], 4,  681279174);d=hh(d,a,b,c,x[i+ 0],11, -358537222);
          c=hh(c,d,a,b,x[i+ 3],16, -722521979);b=hh(b,c,d,a,x[i+ 6],23,   76029189);a=hh(a,b,c,d,x[i+ 9], 4, -640364487);
          d=hh(d,a,b,c,x[i+12],11, -421815835);c=hh(c,d,a,b,x[i+15],16,  530742520);b=hh(b,c,d,a,x[i+ 2],23, -995338651);
          a=ii(a,b,c,d,x[i+ 0], 6, -198630844);d=ii(d,a,b,c,x[i+ 7],10, 1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);
          b=ii(b,c,d,a,x[i+ 5],21,  -57434055);a=ii(a,b,c,d,x[i+12], 6, 1700485571);d=ii(d,a,b,c,x[i+ 3],10,-1894986606);
          c=ii(c,d,a,b,x[i+10],15,   -1051523);b=ii(b,c,d,a,x[i+ 1],21,-2054922799);a=ii(a,b,c,d,x[i+ 8], 6, 1873313359);
          d=ii(d,a,b,c,x[i+15],10,  -30611744);c=ii(c,d,a,b,x[i+ 6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21, 1309151649);
          a=ii(a,b,c,d,x[i+ 4], 6, -145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+ 2],15,  718787259);
          b=ii(b,c,d,a,x[i+ 9],21, -343485551);a=ad(a,olda);b=ad(b,oldb);c=ad(c,oldc);d=ad(d,oldd);
      }
      return rh(a)+rh(b)+rh(c)+rh(d);
  }


  // Integrity checker for native function calls inside SWAPP. Use to prevent run-time code overriding. 
  // Example: console.log is used inside SWAPP and attackers override console.log to execute malicious code. 
  // This function ensures the native calls specified through addFnc() are not tampered before the execution. 
  // Output return a boolean and the invalid signature in case the result is false.

  let sList = []; // MD5 Signature list
  let defaultSig = ["74a59f5d24df2eb823764323e4db574e"]; // A default MD5 signature of native function without tampering.

  function checkIntegrity() {
    let i = document.createElement('iframe');
    let ret = {};

    document.body.appendChild(i);
    
    for(s of sList)
    {
      let fDefinition = i.contentWindow.Function.prototype.toString.call(eval(s.fname));
      let fSig = md5(fDefinition.match(/{.*?}/)[0]);

      if(!s.sig.includes(fSig) && !defaultSig.includes(fSig))
      {
        //Illegal call
        console.log("Unmatched allowed signature error: ", fDefinition);
        ret.status = false;
        ret.info = fDefinition;
        document.body.removeChild(i);
        return ret;
      }
    }

    ret.status = true;
    document.body.removeChild(i);
    return ret;
  }


  // A function to add a list of native functions that SWAPP needs to check their integrity before execution.
  // Input includes function names and allowed function signature.
  // Example input: ["f1", {"fname": "f1", "sig": ["sig1", "sig2"]}, "f3"]

  function addFnc(lst)
  {
    for(l of lst)
    {
      if(typeof(l) == "string")
      {
        sList.push({"fname": l, "sig": []})
      }
      else if(typeof(l) == "object")
      {
        sList.push(l)        
      }
      else
      {

      }
    }
  }


	// Init secure message channel. This is to prevent attacker impersonation. 
  // Originally, the SW allows multiple "message" event handlers and broadcast to all document context, but we want to avoid this behavior. Lessons learned from The postman rings twice and the NDSS 2020 follow up work.
  // Letting apps take care of messages through their own handler means they have to validate the impersonation and intended recipients, which app writers may not follow the best practices.
  // Therefore, we instantiate a dedicated Message Channel that SWAPP uses for main communication. This channel is not open to external code outside TCB, and we randomize a token as well just in case attackers can bypass this channel. 
  // As long as the Closure works as intended (i.e., preventing accesses from the external) this will ensure the security of the message channel.

	var msgChannel = new MessageChannel();
	//__SECRET__
	var handlers = [];

	msgChannel.port1.onmessage = function(event) {
		let label = event.data.label;
		let msg = event.data.msg;
		
		if(event.data.secret != secret)
		{
			console.log("[Error] Incorrect secret code");
			return;
		}

		for(let i=0; i<handlers.length; i++)
		{
			let handler = handlers[i];

			if(handler.hasOwnProperty("msgLabel"))
			{
				let matchedLabel = intersect(handler.msgLabel, label);

				if(matchedLabel.length > 0)
				{
					handler.msgHandler(matchedLabel, msg); 
				}
			}
		}
	};	


  // A function to send postMessage.

	function sendMsg(label, msg)
	{
		navigator.serviceWorker.controller.postMessage({"label": label, "msg": msg, "secret": secret});
	}

  
  // Notify SWAPP's SW to know the dedicate port.
	navigator.serviceWorker.controller.postMessage({"label": ["SWAPP_INIT"], "msg": "", "secret": secret}, [msgChannel.port2]);

	//__EOF__

})();

console.log("TCB Injected");

