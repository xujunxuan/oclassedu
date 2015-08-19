define([
    'jquery'
    , 'underscore'
    , 'backbone'
    , 'bootstrap'
], function(
    $
    , _
    , Backbone
    ) {
    'use strict';

    var App = {
        root: '/'
        , api: ''
        , site: null
        , setTitle: function(title){
            document.title = title + ' - ' + (this.site.get('college_name') || this.site.get('title'));
        }
        , host: function(){
            var loc = window.location;
            return loc.protocol + loc.hostname + ((location.port && location.port != '80') ? ':' + location.port : '');
        }
        , initialize: function(callback){
            _.extend(this, Backbone.Events);
//      // Patch Model and Collection.
//      _.each(["Model", "Collection"], function(name) {
//        // Cache Backbone constructor.
//        var ctor = Backbone[name];
//        // Cache original fetch.
//        var fetch = ctor.prototype.fetch;
//
//        // Override the fetch method to emit a fetch event.
//        ctor.prototype.fetch = function(options) {
//          var _options = _.defaults({
//            progress: function(event){
//              if(event.lengthComputable) {
//                //calculate the percentage loaded
//                var pct = (event.loaded / event.total).toFixed(1);
//                console.log(pct);
//              }
//              //this usually happens when Content-Length isn't set
//              else {
//                console.warn('Content Length not reported!');
//              }
//            }
//          }, options);
//          return fetch.call(this, _options);
//        };
//      });

            this.trigger("app:initialize");
        }

    };


    return App;
});
