({
    baseUrl: '.',
    urlArgs: null,
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
        , flexslider:             'vendor/jquery.flexslider'
        , textSearch:             'vendor/jquery.textSearch'
        , app:                    'app'
        , router:                 'router'
    }
    , preserveLicenseComments: false
    , name: 'vendor/almond'
    , include: 'main'
    , out: 'main.my.js'
    , optimize: 'none'
})