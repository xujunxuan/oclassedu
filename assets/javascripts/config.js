require.config({
    baseUrl: 'assets/javascripts/',
    urlArgs: "bust=" + (new Date()).getTime(),
    shim: {
        jquery: {
            exports: '$'
        }
        , underscore: {
            exports: '_'
        }
        , backbone: {
            deps: ['json', 'underscore', 'jquery'],
            exports: 'Backbone'
        }
        , app: {
            deps: ['backbone', 'bootstrap', 'jwplayer']
        }
        , bootstrap: {
            deps: ['jquery'],
            exports: '$.fn.popover'
        }
        , ionRangeSlider: {
            deps: ['jquery'],
            exports: '$.fn.ionRangeSlider'
            //jQuery的范围滑块 plugin
        }
        , superslide: {
            deps: ['jquery'],
            exports: '$.fn.superslide'
        } 
    }
    , paths: {
        json:                     'vendor/json2'
        , jquery:                 'vendor/jquery'
        , underscore:             'vendor/underscore'
        , backbone:               'vendor/backbone'
        , text:                   'vendor/text'
        , bootstrap:              'vendor/bootstrap'
        , jwplayer:               'vendor/jwplayer'
        , ionRangeSlider:         'vendor/jquery.ion.rangeSlider'
        , superslide:             'vendor/superslide.2.1'
        , flexslider:             'vendor/jquery.flexslider'
        , textSearch:             'vendor/jquery.textSearch'
        , app:                    'app'
        , router:                 'router'
    }
});
require(['main']);